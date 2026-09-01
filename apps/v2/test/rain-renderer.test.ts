import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { init, target } from "vgpu/node";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { createSceneEngine } from "../src/engine/scene-engine";
import { DEFAULT_DISPLAY, DEFAULT_TABLE_CAMERA, fitTableCamera, getTableBounds } from "../src/engine/table-camera";
import { hasVisibleAnimatedEffects } from "../src/renderer/animation-demand";
import { compileProjection, gridToTargetPx, targetPxToGrid } from "../src/renderer/projection";
import { createRenderPlan } from "../src/renderer/render-plan";
import { rainVanishingPoint } from "../src/renderer/particle-effect-definitions";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { renderHeadlessScene } from "../scripts/render-scene";
import { loadSceneShaders } from "../scripts/load-scene-shaders";

const digest = (pixels: Uint8Array) => createHash("sha256").update(pixels).digest("hex");

function brightComponentExtents(pixels: Uint8Array, size: readonly [number, number], vanishing: { readonly x: number; readonly y: number }) {
  let peak = 0;
  let peakX = 0;
  let peakY = 0;
  for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) {
    const offset = (y * size[0] + x) * 4;
    const value = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    if (value > peak) { peak = value; peakX = x; peakY = y; }
  }
  const dx = peakX - vanishing.x;
  const dy = peakY - vanishing.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const radial = { x: dx / distance, y: dy / distance };
  const tangent = { x: -radial.y, y: radial.x };
  const axial: number[] = [];
  const cross: number[] = [];
  for (let y = Math.max(0, peakY - 100); y < Math.min(size[1], peakY + 101); y++) {
    for (let x = Math.max(0, peakX - 100); x < Math.min(size[0], peakX + 101); x++) {
      const offset = (y * size[0] + x) * 4;
      if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < peak * 0.5) continue;
      axial.push((x - peakX) * radial.x + (y - peakY) * radial.y);
      cross.push((x - peakX) * tangent.x + (y - peakY) * tangent.y);
    }
  }
  return {
    axial: axial.length > 0 ? Math.max(...axial) - Math.min(...axial) : 0,
    cross: cross.length > 0 ? Math.max(...cross) - Math.min(...cross) : 0,
    peak,
    peakX,
    peakY,
  };
}

function orientedGaussianMoments(
  pixels: Uint8Array,
  size: readonly [number, number],
  vanishing: { readonly x: number; readonly y: number },
) {
  let total = 0;
  let centerX = 0;
  let centerY = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const weight = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    const pixel = offset / 4;
    total += weight;
    centerX += pixel % size[0] * weight;
    centerY += Math.floor(pixel / size[0]) * weight;
  }
  centerX /= Math.max(total, 1);
  centerY /= Math.max(total, 1);
  const dx = centerX - vanishing.x;
  const dy = centerY - vanishing.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const radial = { x: dx / distance, y: dy / distance };
  const tangent = { x: -radial.y, y: radial.x };
  let longitudinal = 0;
  let cross = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const weight = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    const pixel = offset / 4;
    const px = pixel % size[0] - centerX;
    const py = Math.floor(pixel / size[0]) - centerY;
    longitudinal += ((px * radial.x + py * radial.y) ** 2) * weight;
    cross += ((px * tangent.x + py * tangent.y) ** 2) * weight;
  }
  return {
    longitudinal: Math.sqrt(longitudinal / Math.max(total, 1)),
    cross: Math.sqrt(cross / Math.max(total, 1)),
    total,
  };
}

function packageHash(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function packageRandom(initializationSeed: number, channel: number): number {
  return packageHash(initializationSeed ^ Math.imul(channel + 1, 0x27d4eb2d)) / 0xffffffff;
}

function firstSpawnForEmitterSeed(emitterSeed: number) {
  const initializationSeed = packageHash(emitterSeed);
  return { x: packageRandom(initializationSeed, 0), y: packageRandom(initializationSeed, 1) };
}

function emitterSeedAtRadius(
  min: { readonly x: number; readonly y: number },
  max: { readonly x: number; readonly y: number },
  vanishing: { readonly x: number; readonly y: number },
  minimumRadius: number,
) {
  for (let seed = 1; seed < 100_000; seed++) {
    const spawn = firstSpawnForEmitterSeed(seed);
    const x = min.x + spawn.x * (max.x - min.x);
    const y = min.y + spawn.y * (max.y - min.y);
    if (Math.hypot(x - vanishing.x, y - vanishing.y) >= minimumRadius) return seed;
  }
  throw new Error(`No deterministic emitter seed found beyond radius ${minimumRadius}`);
}

function rainLayer(visible = true) {
  return {
    id: "weather",
    name: "Weather",
    type: "effects" as const,
    visible,
    effects: [{
      id: "rain",
      kind: "rain" as const,
      name: "Rain",
      visible: true,
      vertices: [{ x: 2, y: 2 }, { x: 30, y: 2 }, { x: 30, y: 20 }, { x: 16, y: 12 }, { x: 2, y: 20 }],
      seed: 1729,
      color: { r: 190, g: 220, b: 255 },
      opacity: 0.9,
      density: 10,
      speed: 3,
      dropSize: 0.65,
    }],
  };
}

function topDownRainScene() {
  const base = createSampleSceneDocument();
  const layer = rainLayer();
  return freezeSceneDocument({
    ...base,
    layers: [{
      ...layer,
      effects: [{
        ...layer.effects[0],
        vertices: [{ x: 4, y: 4 }, { x: 35, y: 4 }, { x: 35, y: 20 }, { x: 4, y: 20 }],
        color: { r: 205, g: 225, b: 255 },
        opacity: 0.72,
        density: 2.4,
        speed: 10,
        dropSize: 0.65,
      }],
    }],
    assets: [],
  });
}

async function renderPersistentOutput(scene: ReturnType<typeof topDownRainScene>, size: readonly [number, number], times: readonly number[]) {
  const gpu = await init({ adapter: "auto" });
  const destination = target(gpu, { size, format: "rgba8unorm" });
  const engine = createSceneEngine(scene);
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await executor.prewarm();
    const frames: Uint8Array[] = [];
    for (const time of times) {
      await executor.render(time);
      frames.push(await destination.read());
    }
    return frames;
  } finally {
    engine.dispose();
    gpu.dispose();
  }
}

test("animation demand requires a visible effect in a visible layer", () => {
  const base = createSampleSceneDocument();
  assert.equal(hasVisibleAnimatedEffects(base), false);
  assert.equal(hasVisibleAnimatedEffects(freezeSceneDocument({ ...base, layers: [...base.layers, rainLayer()] })), true);
  assert.equal(hasVisibleAnimatedEffects(freezeSceneDocument({ ...base, layers: [...base.layers, rainLayer(false)] })), false);
});

test("rain vanishing point is the physical table center and ignores editor camera", () => {
  const table = { originGrid: { x: 7.5, y: -3.25 }, scale: 2.5, displayGrid: true };
  const display = { resolutionPx: { width: 2560, height: 1440 }, diagonalInches: 55 };
  const bounds = getTableBounds(table, display);
  const expected = [(bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2] as const;
  assert.deepEqual(rainVanishingPoint(table, display), expected);
  const editorViews = [
    { table, display, camera: { centerGrid: { x: 0, y: 0 }, cssPixelsPerGrid: 8 } },
    { table, display, camera: { centerGrid: { x: 100, y: -50 }, cssPixelsPerGrid: 96 } },
  ];
  assert.deepEqual(rainVanishingPoint(editorViews[0].table, editorViews[0].display), rainVanishingPoint(editorViews[1].table, editorViews[1].display));
  assert.notDeepEqual(rainVanishingPoint({ ...table, originGrid: { x: 8.5, y: -1.25 } }, display), expected);
  assert.notDeepEqual(rainVanishingPoint({ ...table, scale: 1.25 }, display), expected);
});

test("rain is deterministic at fixed time and respects layer order", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const above = freezeSceneDocument({ ...base, layers: [...base.layers.filter((layer) => layer.type === "assets"), rainLayer()] });
  const below = freezeSceneDocument({ ...base, layers: [rainLayer(), ...base.layers.filter((layer) => layer.type === "assets")] });
  const options = { adapter: "auto", profile: "output", size: [96, 54], scene: above } as const;
  const first = await renderHeadlessScene({ ...options, time: 2.5 });
  const repeated = await renderHeadlessScene({ ...options, time: 2.5 });
  const reordered = await renderHeadlessScene({ ...options, scene: below, time: 2.5 });
  assert.equal(digest(first.pixels), digest(repeated.pixels));
  assert.notEqual(digest(first.pixels), digest(reordered.pixels));
});

test("default top-down rain produces sparse bright impacts without a tinted polygon fill", { timeout: 60_000 }, async () => {
  const scene = topDownRainScene();
  const size = [512, 288] as const;
  const rendered = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 1.375, scene });
  const bounds = getTableBounds(scene.table, DEFAULT_DISPLAY);
  const toPixelX = (grid: number) => Math.floor((grid - bounds.left) / bounds.width * size[0]);
  const toPixelY = (grid: number) => Math.floor((grid - bounds.top) / bounds.height * size[1]);
  let background = 0;
  let lowIntensity = 0;
  let bright = 0;
  let samples = 0;
  for (let y = toPixelY(6); y < toPixelY(18); y++) {
    for (let x = toPixelX(7); x < toPixelX(32); x++) {
      const offset = (y * size[0] + x) * 4;
      const value = Math.max(rendered.pixels[offset], rendered.pixels[offset + 1], rendered.pixels[offset + 2]);
      if (value <= 3) background++;
      if (value <= 24) lowIntensity++;
      if (value >= 96) bright++;
      samples++;
    }
  }
  assert.ok(background > 0, "Gaussian rain should retain exact background pixels");
  assert.ok(lowIntensity / samples > 0.7, `${lowIntensity}/${samples} pixels should remain background or low-intensity Gaussian tail`);
  assert.ok(bright / samples > 0.002, `${bright}/${samples} pixels should form bright impacts`);
  assert.ok(bright / samples < 0.15, `${bright}/${samples} bright Gaussian pixels should remain sparse`);
});

test("perspective rain evolves with streaks aligned radially from its vanishing point", { timeout: 60_000 }, async () => {
  const scene = topDownRainScene();
  const size = [512, 288] as const;
  const [firstPixels, secondPixels] = await renderPersistentOutput(scene, size, [1.375, 1.435]);
  const first = { pixels: firstPixels };
  const second = { pixels: secondPixels };
  assert.notEqual(digest(first.pixels), digest(second.pixels));
  const bounds = getTableBounds(scene.table, DEFAULT_DISPLAY);
  const left = Math.floor(7 / bounds.width * size[0]);
  const right = Math.floor(32 / bounds.width * size[0]);
  const top = Math.floor(6 / bounds.height * size[1]);
  const bottom = Math.floor(18 / bounds.height * size[1]);
  const [vanishingGridX, vanishingGridY] = rainVanishingPoint(DEFAULT_TABLE_CAMERA, DEFAULT_DISPLAY);
  const vanishingX = (vanishingGridX - bounds.left) / bounds.width * size[0];
  const vanishingY = (vanishingGridY - bounds.top) / bounds.height * size[1];
  const brightness = (x: number, y: number) => {
    const offset = (y * size[0] + x) * 4;
    return Math.max(first.pixels[offset], first.pixels[offset + 1], first.pixels[offset + 2]);
  };
  let radialConnectivity = 0;
  let tangentialConnectivity = 0;
  let inwardTemporalOverlap = 0;
  let outwardTemporalOverlap = 0;
  let longRadialStreakPixels = 0;
  let longTangentialPixels = 0;
  for (let y = top + 4; y < bottom - 4; y++) {
    for (let x = left + 4; x < right - 4; x++) {
      const center = brightness(x, y);
      if (center < 32) continue;
      const deltaX = x - vanishingX;
      const deltaY = y - vanishingY;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 28) continue;
      const radialX = Math.round(deltaX / distance * 3);
      const radialY = Math.round(deltaY / distance * 3);
      const tangentX = -radialY;
      const tangentY = radialX;
      radialConnectivity += Math.min(center, brightness(x + radialX, y + radialY))
        + Math.min(center, brightness(x - radialX, y - radialY));
      tangentialConnectivity += Math.min(center, brightness(x + tangentX, y + tangentY))
        + Math.min(center, brightness(x - tangentX, y - tangentY));
      const secondBrightness = (sampleX: number, sampleY: number) => {
        const offset = (sampleY * size[0] + sampleX) * 4;
        return Math.max(second.pixels[offset], second.pixels[offset + 1], second.pixels[offset + 2]);
      };
      const motionX = Math.round(deltaX / distance);
      const motionY = Math.round(deltaY / distance);
      inwardTemporalOverlap += Math.min(center, secondBrightness(x - motionX, y - motionY));
      outwardTemporalOverlap += Math.min(center, secondBrightness(x + motionX, y + motionY));
      if (distance > 80) {
        const connected = (directionX: number, directionY: number) => [6, 12, 18].every((step) =>
          brightness(x - Math.round(directionX * step), y - Math.round(directionY * step)) >= 12
        );
        if (connected(deltaX / distance, deltaY / distance)) longRadialStreakPixels++;
        if (connected(-deltaY / distance, deltaX / distance)) longTangentialPixels++;
      }
    }
  }
  assert.ok(
    radialConnectivity > tangentialConnectivity * 1.15,
    `${radialConnectivity} radial connectivity should dominate tangential ${tangentialConnectivity}`,
  );
  assert.ok(longRadialStreakPixels >= 10, `${longRadialStreakPixels} pixels should belong to radial streaks at least 18px long`);
  assert.ok(
    longRadialStreakPixels > longTangentialPixels * 2,
    `${longRadialStreakPixels} long radial pixels should dominate tangential ${longTangentialPixels}`,
  );
  assert.ok(
    inwardTemporalOverlap > outwardTemporalOverlap * 1.01,
    `${inwardTemporalOverlap} inward temporal overlap should dominate outward ${outwardTemporalOverlap}`,
  );
});

test("stored fall speed controls connected motion-blur length", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const [tableCenterX, tableCenterY] = rainVanishingPoint(DEFAULT_TABLE_CAMERA, DEFAULT_DISPLAY);
  const outerSeed = emitterSeedAtRadius({ x: 2, y: 2 }, { x: 17, y: 9 }, { x: tableCenterX, y: tableCenterY }, 6);
  const sceneAt = (speed: number, density: number) => freezeSceneDocument({
    ...base,
    table: { ...base.table, scale: 2 },
    layers: [{
      ...rainLayer(),
      effects: [{
        ...rainLayer().effects[0],
        vertices: [{ x: 2, y: 2 }, { x: 17, y: 2 }, { x: 17, y: 9 }, { x: 2, y: 9 }],
        seed: outerSeed,
        speed,
        density,
        dropSize: 0.65,
      }],
    }],
    assets: [],
  });
  const size = [512, 288] as const;
  // Equalize steady-state population so this measures length rather than particle count.
  const slow = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 1.375, scene: sceneAt(0.5, 0.001) });
  const fast = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 1.375, scene: sceneAt(20, 0.04) });
  const projection = compileProjection({ kind: "output", table: base.table, display: DEFAULT_DISPLAY }, { width: size[0], height: size[1] });
  const [vanishingGridX, vanishingGridY] = rainVanishingPoint(DEFAULT_TABLE_CAMERA, DEFAULT_DISPLAY);
  const vanishing = gridToTargetPx({ x: vanishingGridX, y: vanishingGridY }, projection);
  const slowMoments = orientedGaussianMoments(slow.pixels, size, vanishing);
  const fastMoments = orientedGaussianMoments(fast.pixels, size, vanishing);
  assert.ok(fastMoments.longitudinal > slowMoments.longitudinal * 1.5, `${fastMoments.longitudinal} fast longitudinal extent should materially exceed slow ${slowMoments.longitudinal}`);
  assert.ok(fastMoments.longitudinal < 30, `${fastMoments.longitudinal} fast longitudinal extent should remain below the prior long-shutter range`);
  assert.ok(Math.abs(fastMoments.cross / slowMoments.cross - 1) < 0.2, `speed should preserve oriented cross width: ${JSON.stringify({ slowMoments, fastMoments })}`);
  assert.ok(fastMoments.longitudinal > fastMoments.cross * 2, `fast anisotropic Gaussian should be substantially longer than wide: ${JSON.stringify(fastMoments)}`);
});

test("rain shader keeps the requested travel, smear, radial, and variation calibrations", async () => {
  const shaders = await loadSceneShaders();
  const shader = shaders.rain as string;
  const contextShader = shaders.rainContext as string;
  assert.match(shader, /radial_distance \* 0\.12 \* perspective_random/);
  assert.match(shader, /0\.035 \+ speed_blur \* 0\.135 \+ radial_distance \* speed_blur \* 0\.0035/);
  assert.match(shader, /smoothstep\(0\.0, 6\.0, radial_distance\)/);
  assert.match(shader, /mix\(0\.18, 1\.0, radial_scale\)/);
  assert.match(shader, /mix\(0\.6, 1\.0, radial_scale\)/);
  assert.match(shader, /mix\(0\.075, 1\.0, radial_scale\)/);
  assert.match(shader, /0\.9 \+ 0\.2 \* \S*particle_random\(particle\.initialization_seed, 13u\)/);
  assert.match(shader, /0\.82 \+ 0\.18 \* \S*particle_random\(particle\.initialization_seed, 61u\)/);
  assert.match(shader, /length\(vec2f\(longitudinal_sigma, cross_sigma\)\) \* 4\.0/);
  assert.match(shader, /clamp\(params\.opacity \* streak \* intensity_random \* input\.state\.w \* enabled, 0\.0, params\.opacity\)/);
  assert.match(shader, /event_impact_grid - context\.vanishing_point/);
  assert.doesNotMatch(shader, /params\.vanishing_point/);
  assert.match(contextShader, /context\.initialization_seed != particle\.initialization_seed/);
  assert.match(contextShader, /RainParticleContext\(particle\.initialization_seed, 1u, params\.vanishing_point\)/);
  assert.match(contextShader, /initialization_seed: u32,\s+initialized: u32,\s+vanishing_point: vec2f/);
});

test("deterministic emission channels keep width and opacity variation narrow and independent", () => {
  const samples = Array.from({ length: 4096 }, (_, seed) => {
    const initializationSeed = packageHash(seed + 1);
    return {
      width: 0.9 + 0.2 * packageRandom(initializationSeed, 13),
      opacity: 0.82 + 0.18 * packageRandom(initializationSeed, 61),
      length: packageRandom(initializationSeed, 31),
    };
  });
  const widths = samples.map((sample) => sample.width);
  const opacities = samples.map((sample) => sample.opacity);
  assert.ok(Math.min(...widths) >= 0.9 && Math.max(...widths) <= 1.1);
  assert.ok(Math.min(...widths) < 0.902 && Math.max(...widths) > 1.098, "width variation should exercise approximately +/-10%");
  assert.ok(Math.min(...opacities) >= 0.82 && Math.max(...opacities) <= 1);
  assert.ok(Math.min(...opacities) < 0.822 && Math.max(...opacities) > 0.998, "opacity variation should exercise approximately 82-100%");
  assert.ok(samples.every((sample) => sample.width !== sample.opacity && sample.opacity !== sample.length), "width, opacity, and length use independent channels");
});

test("drop size controls Gaussian width without changing axial streak length", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const [tableCenterX, tableCenterY] = rainVanishingPoint(DEFAULT_TABLE_CAMERA, DEFAULT_DISPLAY);
  const outerSeed = emitterSeedAtRadius({ x: 2, y: 2 }, { x: 17, y: 9 }, { x: tableCenterX, y: tableCenterY }, 6);
  const sceneAt = (dropSize: number) => freezeSceneDocument({
    ...base,
    table: { ...base.table, scale: 2 },
    layers: [{
      ...rainLayer(),
      effects: [{
        ...rainLayer().effects[0],
        vertices: [{ x: 2, y: 2 }, { x: 17, y: 2 }, { x: 17, y: 9 }, { x: 2, y: 9 }],
        seed: outerSeed,
        density: 0.01,
        speed: 10,
        dropSize,
      }],
    }],
    assets: [],
  });
  const size = [512, 288] as const;
  const narrow = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 1.375, scene: sceneAt(0.15) });
  const wide = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 1.375, scene: sceneAt(2) });
  const upper = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 1.375, scene: sceneAt(10) });
  const maximum = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 1.375, scene: sceneAt(20) });
  const projection = compileProjection({ kind: "output", table: base.table, display: DEFAULT_DISPLAY }, { width: size[0], height: size[1] });
  const [vanishingGridX, vanishingGridY] = rainVanishingPoint(DEFAULT_TABLE_CAMERA, DEFAULT_DISPLAY);
  const vanishing = gridToTargetPx({ x: vanishingGridX, y: vanishingGridY }, projection);
  const narrowMoments = orientedGaussianMoments(narrow.pixels, size, vanishing);
  const wideMoments = orientedGaussianMoments(wide.pixels, size, vanishing);
  const upperMoments = orientedGaussianMoments(upper.pixels, size, vanishing);
  const maximumMoments = orientedGaussianMoments(maximum.pixels, size, vanishing);
  assert.ok(narrowMoments.total > 0 && wideMoments.total > 0);
  assert.ok(wideMoments.cross > narrowMoments.cross * 1.4, `drop size should broaden oriented cross width: ${JSON.stringify({ narrowMoments, wideMoments })}`);
  assert.ok(Math.abs(wideMoments.longitudinal / narrowMoments.longitudinal - 1) < 0.2, `drop size should preserve oriented longitudinal sigma: ${JSON.stringify({ narrowMoments, wideMoments })}`);
  assert.ok(maximumMoments.cross > upperMoments.cross * 1.15, `drop sizes 10 to 20 should remain responsive: ${JSON.stringify({ upperMoments, maximumMoments })}`);
  assert.ok(Math.abs(maximumMoments.longitudinal / upperMoments.longitudinal - 1) < 0.2, `upper drop-size range should preserve longitudinal motion: ${JSON.stringify({ upperMoments, maximumMoments })}`);
});

test("isolated rain moves at constant grid velocity", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const scene = freezeSceneDocument({
    ...base,
    table: { ...base.table, scale: 4 },
    layers: [{
      ...rainLayer(),
      effects: [{
        ...rainLayer().effects[0],
        vertices: [{ x: 0.5, y: 0.5 }, { x: 9, y: 0.5 }, { x: 9, y: 5 }, { x: 0.5, y: 5 }],
        density: 0.001,
        speed: 10,
        dropSize: 0.1,
      }],
    }],
    assets: [],
  });
  const size = [512, 288] as const;
  const lifetime = 1 / (10 * 0.45 * 0.48);
  const lateVisibleTime = lifetime * (0.84 - 0.5);
  const fadeEndTime = lifetime * (0.88 - 0.5);
  const frames = await renderPersistentOutput(scene, size, [0, 0.03, 0.06, lateVisibleTime, fadeEndTime]);
  const centroid = (pixels: Uint8Array) => {
    let total = 0;
    let x = 0;
    let y = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const value = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
      const pixel = offset / 4;
      total += value;
      x += pixel % size[0] * value;
      y += Math.floor(pixel / size[0]) * value;
    }
    return { x: x / Math.max(total, 1), y: y / Math.max(total, 1) };
  };
  const positions = frames.map(centroid);
  const firstStep = Math.hypot(positions[1].x - positions[0].x, positions[1].y - positions[0].y);
  const secondStep = Math.hypot(positions[2].x - positions[1].x, positions[2].y - positions[1].y);
  const spawnUnit = firstSpawnForEmitterSeed(rainLayer().effects[0].seed);
  const impact = { x: 0.5 + spawnUnit.x * 8.5, y: 0.5 + spawnUnit.y * 4.5 };
  const [vanishingX, vanishingY] = rainVanishingPoint(scene.table, DEFAULT_DISPLAY);
  const vanishing = { x: vanishingX, y: vanishingY };
  const radialDistance = Math.hypot(impact.x - vanishing.x, impact.y - vanishing.y);
  const initializationSeed = packageHash(rainLayer().effects[0].seed);
  const perspectiveVariation = 0.58 + 0.74 * packageRandom(initializationSeed, 47);
  const projection = compileProjection({ kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, { width: size[0], height: size[1] });
  const expectedStep = radialDistance * 0.12 * perspectiveVariation * (0.03 / lifetime) * projection.pixelsPerGrid;
  const previousCalibrationStep = expectedStep * 0.5;
  assert.ok(Math.abs(firstStep / expectedStep - 1) < 0.2 && Math.abs(secondStep / expectedStep - 1) < 0.2, `outer travel should match doubled 0.12 calibration: ${JSON.stringify({ firstStep, secondStep, expectedStep })}`);
  assert.ok(firstStep > previousCalibrationStep * 1.6 && secondStep > previousCalibrationStep * 1.6, `travel should be about twice the previous 0.06 calibration: ${JSON.stringify({ firstStep, secondStep, previousCalibrationStep })}`);
  assert.ok(Math.abs(firstStep - secondStep) < 0.75, `equal time steps should have equal displacement within raster tolerance: ${firstStep},${secondStep}`);
  const totalIntensity = (pixels: Uint8Array) => pixels.reduce((total, value, index) => index % 4 === 3 ? total : total + value, 0);
  const lateIntensity = totalIntensity(frames[3]);
  const fadedIntensity = totalIntensity(frames[4]);
  assert.ok(lateIntensity > 0 && fadedIntensity < lateIntensity * 0.1, `rain should fade near zero by phase 0.88: ${lateIntensity},${fadedIntensity}`);
  const remainingTravelPixels = (firstStep + secondStep) * 0.5 * ((1 - 0.88) * lifetime / 0.03);
  assert.ok(remainingTravelPixels > 0.3, `${remainingTravelPixels} pixels of perspective travel should remain when fade completes`);
});

test("outer impacts move farther than stable near-center impacts for the same phase step", { timeout: 60_000 }, async () => {
  let centerSeed = -1;
  let outerSeed = -1;
  for (let seed = 1; seed < 100_000 && (centerSeed < 0 || outerSeed < 0); seed++) {
    const spawn = firstSpawnForEmitterSeed(seed);
    const radius = Math.hypot(spawn.x - 0.5, spawn.y - 0.5);
    if (centerSeed < 0 && radius < 0.025) centerSeed = seed;
    if (outerSeed < 0 && radius > 0.32 && radius < 0.4) outerSeed = seed;
  }
  assert.ok(centerSeed > 0 && outerSeed > 0);
  const base = createSampleSceneDocument();
  const sceneAt = (seed: number) => freezeSceneDocument({
    ...base,
    table: { ...base.table, scale: 4 },
    layers: [{
      ...rainLayer(),
      effects: [{
        ...rainLayer().effects[0],
        vertices: [{ x: 0.5, y: 0.5 }, { x: 9, y: 0.5 }, { x: 9, y: 5 }, { x: 0.5, y: 5 }],
        seed,
        density: 0.001,
        speed: 10,
        dropSize: 0.1,
      }],
    }],
    assets: [],
  });
  const size = [512, 288] as const;
  const movement = async (seed: number) => {
    const frames = await renderPersistentOutput(sceneAt(seed), size, [0, 0.03]);
    const centroid = (pixels: Uint8Array) => {
      let total = 0;
      let x = 0;
      let y = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const value = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        const pixel = offset / 4;
        total += value;
        x += pixel % size[0] * value;
        y += Math.floor(pixel / size[0]) * value;
      }
      return { x: x / Math.max(total, 1), y: y / Math.max(total, 1), total };
    };
    const first = centroid(frames[0]);
    const second = centroid(frames[1]);
    assert.ok(Number.isFinite(first.x) && Number.isFinite(first.y) && first.total > 0);
    return Math.hypot(second.x - first.x, second.y - first.y);
  };
  const centerMovement = await movement(centerSeed);
  const outerMovement = await movement(outerSeed);
  assert.ok(Number.isFinite(centerMovement) && centerMovement >= 0, `center movement should remain finite: ${centerMovement}`);
  assert.ok(outerMovement > centerMovement * 2 && outerMovement > 0.2, `outer movement ${outerMovement} should materially exceed center ${centerMovement}`);
});

test("matched near-center rain is shorter, narrower, and dimmer than outer rain", { timeout: 60_000 }, async () => {
  const emitterMin = { x: 10, y: 6 };
  const emitterMax = { x: 28, y: 18 };
  const [vanishingGridX, vanishingGridY] = rainVanishingPoint(DEFAULT_TABLE_CAMERA, DEFAULT_DISPLAY);
  const vanishingGrid = { x: vanishingGridX, y: vanishingGridY };
  const candidates = { center: [] as number[], outer: [] as number[] };
  for (let seed = 1; seed < 200_000 && (candidates.center.length < 24 || candidates.outer.length < 24); seed++) {
    const spawn = firstSpawnForEmitterSeed(seed);
    const point = {
      x: emitterMin.x + spawn.x * (emitterMax.x - emitterMin.x),
      y: emitterMin.y + spawn.y * (emitterMax.y - emitterMin.y),
    };
    const radius = Math.hypot(point.x - vanishingGrid.x, point.y - vanishingGrid.y);
    if (radius < 0.18 && candidates.center.length < 24) candidates.center.push(seed);
    if (radius > 5 && radius < 5.5 && candidates.outer.length < 24) candidates.outer.push(seed);
  }
  assert.equal(candidates.center.length, 24);
  assert.equal(candidates.outer.length, 24);
  const variation = (seed: number) => {
    const initializationSeed = packageHash(seed);
    return {
      width: packageRandom(initializationSeed, 13),
      length: packageRandom(initializationSeed, 31),
      opacity: packageRandom(initializationSeed, 61),
    };
  };
  let matched = { center: candidates.center[0], outer: candidates.outer[0], score: Number.POSITIVE_INFINITY };
  for (const center of candidates.center) for (const outer of candidates.outer) {
    const a = variation(center);
    const b = variation(outer);
    const score = Math.abs(a.width - b.width) + Math.abs(a.length - b.length) + Math.abs(a.opacity - b.opacity);
    if (score < matched.score) matched = { center, outer, score };
  }
  assert.ok(matched.score < 0.2, `matched random channels should isolate radial attenuation: ${JSON.stringify(matched)}`);

  const base = createSampleSceneDocument();
  const sceneAt = (seed: number) => freezeSceneDocument({
    ...base,
    layers: [{
      ...rainLayer(),
      effects: [{
        ...rainLayer().effects[0],
        vertices: [emitterMin, { x: emitterMax.x, y: emitterMin.y }, emitterMax, { x: emitterMin.x, y: emitterMax.y }],
        seed,
        color: { r: 255, g: 255, b: 255 },
        opacity: 0.72,
        density: 0.001,
        speed: 10,
        dropSize: 2,
      }],
    }],
    assets: [],
  });
  const size = [512, 288] as const;
  const center = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 0, scene: sceneAt(matched.center) });
  const outer = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 0, scene: sceneAt(matched.outer) });
  const projection = compileProjection({ kind: "output", table: base.table, display: DEFAULT_DISPLAY }, { width: size[0], height: size[1] });
  const vanishing = gridToTargetPx(vanishingGrid, projection);
  const centerMoments = orientedGaussianMoments(center.pixels, size, vanishing);
  const outerMoments = orientedGaussianMoments(outer.pixels, size, vanishing);
  const peak = (pixels: Uint8Array) => {
    let value = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) value = Math.max(value, pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    return value;
  };
  const centerPeak = peak(center.pixels);
  const outerPeak = peak(outer.pixels);
  assert.ok(centerMoments.longitudinal < outerMoments.longitudinal * 0.55, `center longitudinal extent should be materially shorter: ${JSON.stringify({ centerMoments, outerMoments })}`);
  assert.ok(centerMoments.cross < outerMoments.cross * 0.85, `center cross extent should be materially narrower: ${JSON.stringify({ centerMoments, outerMoments })}`);
  assert.ok(centerPeak < outerPeak * 0.25, `center peak should reflect the low visibility floor: ${JSON.stringify({ centerPeak, outerPeak })}`);
  assert.ok(centerMoments.total < outerMoments.total * 0.12, `center total opacity should reflect the low visibility floor: ${JSON.stringify({ centerMoments, outerMoments })}`);
  assert.ok(outerPeak >= 170, `outer rain should remain capable of approaching authored maximum opacity: ${outerPeak}`);
});

test("editor zoom scales pixel footprint while preserving grid-space shape and particle state", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const vertices = [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 5 }, { x: 1, y: 5 }];
  const scene = freezeSceneDocument({
    ...base,
    layers: [{ ...rainLayer(), effects: [{ ...rainLayer().effects[0], vertices, density: 0.1, speed: 10 }] }],
    assets: [],
  });
  const size = [512, 288] as const;
  const renderZoom = async (pixelsPerGrid: number) => {
    const gpu = await init({ adapter: "auto" });
    const destination = target(gpu, { size, format: "rgba8unorm" });
    const engine = createSceneEngine(scene);
    const view = {
      kind: "editor" as const,
      table: scene.table,
      display: DEFAULT_DISPLAY,
      camera: { centerGrid: { x: 4.5, y: 3 }, cssPixelsPerGrid: pixelsPerGrid },
      viewportCss: { width: size[0], height: size[1] },
    };
    try {
      const executor = createSceneExecutor(gpu, destination, createRenderPlan("editor"), await loadSceneShaders(), view, engine.getSnapshot());
      executor.setGridVisible(false);
      await executor.prewarm();
      await executor.render(0);
      const projection = compileProjection(view, { width: size[0], height: size[1] });
      return {
        pixels: await destination.read(),
        projection,
        diagnostics: await executor.effectEmissionDiagnostics(),
      };
    } finally {
      engine.dispose();
      gpu.dispose();
    }
  };
  const low = await renderZoom(24);
  const high = await renderZoom(48);
  assert.deepEqual(
    low.diagnostics[0].liveParticleRecords.map((particle) => particle.initializationSeed),
    high.diagnostics[0].liveParticleRecords.map((particle) => particle.initializationSeed),
    "fixed-time simulation state must not depend on editor zoom",
  );
  const lowVanishing = gridToTargetPx({ x: 4.5, y: 3 }, low.projection);
  const highVanishing = gridToTargetPx({ x: 4.5, y: 3 }, high.projection);
  const interiorOnly = (pixels: Uint8Array, projection: ReturnType<typeof compileProjection>) => {
    const filtered = new Uint8Array(pixels);
    for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) {
      const grid = targetPxToGrid({ x: x + 0.5, y: y + 0.5 }, projection);
      if (grid.x > 1.6 && grid.x < 7.4 && grid.y > 1.6 && grid.y < 4.4) continue;
      const offset = (y * size[0] + x) * 4;
      filtered[offset] = filtered[offset + 1] = filtered[offset + 2] = 0;
    }
    return filtered;
  };
  const lowExtents = brightComponentExtents(interiorOnly(low.pixels, low.projection), size, lowVanishing);
  const highExtents = brightComponentExtents(interiorOnly(high.pixels, high.projection), size, highVanishing);
  assert.ok(highExtents.axial > lowExtents.axial * 1.6 && highExtents.cross > lowExtents.cross * 1.6, `pixel footprint should scale with zoom: ${JSON.stringify({ lowExtents, highExtents })}`);
  const lowGrid = { axial: lowExtents.axial / low.projection.pixelsPerGrid, cross: lowExtents.cross / low.projection.pixelsPerGrid };
  const highGrid = { axial: highExtents.axial / high.projection.pixelsPerGrid, cross: highExtents.cross / high.projection.pixelsPerGrid };
  assert.ok(Math.abs(highGrid.axial / lowGrid.axial - 1) < 0.2, `normalized axial extent should be zoom invariant: ${JSON.stringify({ lowGrid, highGrid })}`);
  assert.ok(Math.abs(highGrid.cross / lowGrid.cross - 1) < 0.2, `normalized cross extent should be zoom invariant: ${JSON.stringify({ lowGrid, highGrid })}`);
});

test("independent event streams stay populated and do not repeat after a nominal cycle", { timeout: 60_000 }, async () => {
  const scene = topDownRainScene();
  const size = [256, 144] as const;
  const gpu = await init({ adapter: "auto" });
  const destination = target(gpu, { size, format: "rgba8unorm" });
  const engine = createSceneEngine(scene);
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await executor.prewarm();
    const nominalLifetime = 1 / (10 * 0.45 * 0.48);
    const times = [0, 0.27, 0.54, 0.81, 1.08, 1.35, 1.62, 1.89, 2.16, 2.4, 2.4 + nominalLifetime];
    const hashes = new Set<string>();
    const brightCounts: number[] = [];
    const quadrantHistory: number[][] = [];
    for (const time of times) {
      await executor.render(time);
      const pixels = await destination.read();
      hashes.add(digest(pixels));
      const quadrants = [0, 0, 0, 0];
      let minX: number = size[0];
      let maxX = -1;
      let minY: number = size[1];
      let maxY = -1;
      for (let y = 0; y < size[1]; y++) {
        for (let x = 0; x < size[0]; x++) {
          const offset = (y * size[0] + x) * 4;
          if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 24) continue;
          quadrants[(y >= size[1] / 2 ? 2 : 0) + (x >= size[0] / 2 ? 1 : 0)]++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      assert.ok(quadrants.every((count) => count >= 4), `rain should remain staggered across all quadrants at t=${time}: ${quadrants}`);
      const bounds = getTableBounds(scene.table, DEFAULT_DISPLAY);
      const polygonWidthPx = 31 / bounds.width * size[0];
      const polygonHeightPx = 16 / bounds.height * size[1];
      assert.ok((maxX - minX) / polygonWidthPx >= 0.6, `rain width span should resist central clustering at t=${time}: ${minX}-${maxX}`);
      assert.ok((maxY - minY) / polygonHeightPx >= 0.6, `rain height span should resist central clustering at t=${time}: ${minY}-${maxY}`);
      quadrantHistory.push(quadrants);
      brightCounts.push(quadrants.reduce((sum, count) => sum + count, 0));
    }
    assert.equal(hashes.size, times.length, "every sampled event-stream frame should be unique");
    assert.ok(Math.min(...brightCounts) > 0, "no sampled time should produce a globally blank rain region");
    assert.ok(Math.max(...brightCounts) / Math.min(...brightCounts) < 3, `staggered coverage should avoid a global pulse: ${brightCounts}`);
    assert.ok(quadrantHistory.slice(1).some((quadrants, index) => {
      const changes = quadrants.map((count, quadrant) => count - quadrantHistory[index][quadrant]);
      return changes.some((change) => change > 0) && changes.some((change) => change < 0);
    }), `independent slots should make regions brighten and fade out of sync: ${JSON.stringify(quadrantHistory)}`);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("one drop generation fades from zero through authored peak and back to zero smoothly", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const scene = freezeSceneDocument({
    ...base,
    table: { ...base.table, scale: 4 },
    layers: [{
      ...rainLayer(),
      effects: [{
        ...rainLayer().effects[0],
        vertices: [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 4 }, { x: 1, y: 4 }],
        color: { r: 255, g: 255, b: 255 },
        opacity: 0.72,
        density: 0.1,
        speed: 10,
        dropSize: 0.65,
      }],
    }],
    assets: [],
  });
  const size = [512, 288] as const;
  const gpu = await init({ adapter: "auto" });
  const destination = target(gpu, { size, format: "rgba8unorm" });
  const engine = createSceneEngine(scene);
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await executor.prewarm();
    const totals: number[] = [];
    const centroids: { readonly x: number; readonly y: number }[] = [];
    let peakPixel = 0;
    let peakTotal = -1;
    let peakFrame: Uint8Array<ArrayBufferLike> = new Uint8Array();
    for (let sample = 0; sample <= 100; sample++) {
      await executor.render(sample * 0.03);
      const pixels = await destination.read();
      let total = 0;
      let weightedX = 0;
      let weightedY = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const value = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        total += value;
        const pixel = offset / 4;
        weightedX += pixel % size[0] * value;
        weightedY += Math.floor(pixel / size[0]) * value;
        peakPixel = Math.max(peakPixel, value);
      }
      totals.push(total);
      centroids.push({ x: weightedX / Math.max(total, 1), y: weightedY / Math.max(total, 1) });
      if (total > peakTotal) {
        peakTotal = total;
        peakFrame = pixels;
      }
    }
    const peak = Math.max(...totals);
    const low = Math.min(...totals);
    assert.ok(peakPixel >= 120, `${peakPixel} should demonstrate a strong visible envelope peak`);
    assert.ok(low / peak < 0.08, `${low}/${peak} should approach zero at event boundaries`);
    assert.ok(totals.slice(0, -3).some((value, index) =>
      value > peak * 0.6 && value > totals[index + 1] && totals[index + 1] > totals[index + 2] && totals[index + 2] > totals[index + 3]
    ), `a visible particle should have a smooth multi-frame fade segment: ${totals}`);
    const generationPeaks = totals.flatMap((value, index) =>
      index > 0 && index < totals.length - 1 && value > peak * 0.5 && value >= totals[index - 1] && value > totals[index + 1]
        ? [centroids[index]]
        : []
    );
    assert.ok(generationPeaks.length >= 2, `expected multiple visible generations, received ${generationPeaks.length}`);
    assert.ok(generationPeaks.some((position, index) => generationPeaks.slice(index + 1).some((other) =>
      Math.hypot(position.x - other.x, position.y - other.y) >= 8
    )), `successive GPU generations should choose independent spawn positions: ${JSON.stringify(generationPeaks)}`);
    const projection = compileProjection({ kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, { width: size[0], height: size[1] });
    const [vanishingGridX, vanishingGridY] = rainVanishingPoint(DEFAULT_TABLE_CAMERA, DEFAULT_DISPLAY);
    const vanishing = gridToTargetPx({ x: vanishingGridX, y: vanishingGridY }, projection);
    let centerProfile = 0;
    let firstEdgeProfile = 0;
    let secondEdgeProfile = 0;
    for (let y = 3; y < size[1] - 3; y++) {
      for (let x = 3; x < size[0] - 3; x++) {
        const valueAt = (sampleX: number, sampleY: number) => {
          const offset = (sampleY * size[0] + sampleX) * 4;
          return Math.max(peakFrame[offset], peakFrame[offset + 1], peakFrame[offset + 2]);
        };
        const center = valueAt(x, y);
        if (center < 96) continue;
        const dx = x - vanishing.x;
        const dy = y - vanishing.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const tangentX = Math.round(-dy / distance);
        const tangentY = Math.round(dx / distance);
        centerProfile += center * 2;
        firstEdgeProfile += valueAt(x + tangentX, y + tangentY) + valueAt(x - tangentX, y - tangentY);
        secondEdgeProfile += valueAt(x + tangentX * 2, y + tangentY * 2) + valueAt(x - tangentX * 2, y - tangentY * 2);
      }
    }
    assert.ok(centerProfile > firstEdgeProfile && firstEdgeProfile > secondEdgeProfile, `Gaussian profile should decrease monotonically: ${centerProfile},${firstEdgeProfile},${secondEdgeProfile}`);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("editor rain guides strengthen on selection while output omits all guides", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const scene = freezeSceneDocument({ ...base, layers: [rainLayer()], assets: [] });
  const engine = createSceneEngine(scene);
  const size = [192, 108] as const;
  const viewportCss = { width: size[0], height: size[1] };
  const shaders = await loadSceneShaders();
  const editorGpu = await init({ adapter: "auto" });
  const outputGpu = await init({ adapter: "auto" });
  try {
    const editorTarget = target(editorGpu, { size, format: "rgba8unorm" });
    const outputTarget = target(outputGpu, { size, format: "rgba8unorm" });
    const editor = createSceneExecutor(
      editorGpu, editorTarget, createRenderPlan("editor"), shaders,
      {
        kind: "editor", table: scene.table, display: DEFAULT_DISPLAY,
        camera: fitTableCamera(getTableBounds(scene.table, DEFAULT_DISPLAY), viewportCss), viewportCss,
      }, engine.getSnapshot(),
    );
    const output = createSceneExecutor(
      outputGpu, outputTarget, createRenderPlan("output"), shaders,
      { kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await Promise.all([editor.prewarm(), output.prewarm()]);
    await editor.render(1);
    await output.render(1);
    const ordinaryEditor = await editorTarget.read();
    const ordinaryOutput = await outputTarget.read();

    engine.dispatch({ type: "effect.selection.set", selection: { layerId: "weather", effectId: "rain" } });
    editor.setSnapshot(engine.getSnapshot());
    output.setSnapshot(engine.getSnapshot());
    await editor.render(1);
    await output.render(1);
    const selectedEditor = await editorTarget.read();
    const selectedOutput = await outputTarget.read();
    assert.notEqual(digest(ordinaryEditor), digest(selectedEditor));
    assert.equal(digest(ordinaryOutput), digest(selectedOutput));

    const token = engine.beginEffect("weather", { ...rainLayer().effects[0], id: "rain/draft", vertices: [] }, { x: 5, y: 5 });
    engine.appendEffectVertex(token, { x: 10, y: 5 });
    engine.appendEffectVertex(token, { x: 10, y: 10 });
    engine.updateEffectCursor(token, { x: 5, y: 10 });
    await editor.replaceEffects(engine.getSnapshot());
    editor.setSnapshot(engine.getSnapshot());
    await editor.render(1);
    const drawingEditor = await editorTarget.read();
    assert.notEqual(digest(selectedEditor), digest(drawingEditor));
  } finally {
    editorGpu.dispose();
    outputGpu.dispose();
    engine.dispose();
  }
});
