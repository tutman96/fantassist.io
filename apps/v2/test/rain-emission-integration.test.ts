import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { init, target } from "vgpu/node";

import { createSceneEngine } from "../src/engine/scene-engine";
import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { DEFAULT_DISPLAY } from "../src/engine/table-camera";
import { compileProjection, targetPxToGrid } from "../src/renderer/projection";
import { createRenderPlan } from "../src/renderer/render-plan";
import { rainVanishingPoint } from "../src/renderer/particle-effect-definitions";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { loadSceneShaders } from "../scripts/load-scene-shaders";

const digest = (pixels: Uint8Array) => createHash("sha256").update(pixels).digest("hex");
const visiblePixels = (pixels: Uint8Array) => {
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset] > 3 || pixels[offset + 1] > 3 || pixels[offset + 2] > 3) count++;
  }
  return count;
};

const pointInPolygon = (point: { readonly x: number; readonly y: number }, vertices: readonly { readonly x: number; readonly y: number }[]) => {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const a = vertices[index];
    const b = vertices[previous];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

const distanceToEdges = (point: { readonly x: number; readonly y: number }, vertices: readonly { readonly x: number; readonly y: number }[]) =>
  Math.min(...vertices.map((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / Math.max(dx * dx + dy * dy, 1e-8)));
    return Math.hypot(point.x - start.x - dx * amount, point.y - start.y - dy * amount);
  }));

const closePoint = (actual: readonly [number, number], expected: readonly [number, number]) =>
  Math.abs(actual[0] - expected[0]) < 0.0001 && Math.abs(actual[1] - expected[1]) < 0.0001;

const switchRain = (id: string, seed: number, vertices: readonly { readonly x: number; readonly y: number }[]) => ({
  id,
  kind: "rain" as const,
  name: id,
  visible: true,
  vertices,
  seed,
  color: { r: 205, g: 225, b: 255 },
  opacity: 0.72,
  density: 1,
  speed: 0.5,
  dropSize: 0.65,
});

const switchScene = (id: string, effects: readonly ReturnType<typeof switchRain>[]) => {
  const base = createSampleSceneDocument();
  return freezeSceneDocument({
    ...base,
    id,
    layers: effects.length > 0 ? [{ id: "weather", name: "Weather", type: "effects" as const, visible: true, effects }] : [],
    assets: [],
  });
};

test("persistent executor ramps rain emission, preserves live particles on stop, and retires after drain", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const layerId = "weather/integration";
  const rain = {
    id: "rain/integration",
    kind: "rain" as const,
    name: "Integration rain",
    visible: true,
    vertices: [{ x: 4, y: 4 }, { x: 34, y: 4 }, { x: 34, y: 20 }, { x: 4, y: 20 }],
    seed: 4242,
    color: { r: 205, g: 225, b: 255 },
    opacity: 0.72,
    density: 2.4,
    speed: 10,
    dropSize: 0.65,
  };
  const initialScene = freezeSceneDocument({
    ...base,
    layers: [{ id: layerId, name: "Weather", type: "effects", visible: true, effects: [] }],
    assets: [],
  });
  const engine = createSceneEngine(initialScene);
  const gpu = await init({ adapter: "auto", label: "rain-emission-integration" });
  const destination = target(gpu, { size: [384, 216], format: "rgba8unorm", label: "rain-emission-integration" });
  try {
    const executor = createSceneExecutor(
      gpu,
      destination,
      createRenderPlan("output"),
      await loadSceneShaders(),
      { kind: "output", table: initialScene.table, display: DEFAULT_DISPLAY },
      engine.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(0);
    const baseline = await destination.read();
    assert.equal(visiblePixels(baseline), 0);
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.hasAnimationDemand(), false);

    assert.equal(engine.dispatch({ type: "effect.insert", layerId, effect: rain }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0);
    assert.equal(visiblePixels(await destination.read()), 0, "an inserted emitter starts empty");

    const rampDigests = new Set<string>();
    let establishedPixels = 0;
    for (const time of [0.08, 0.16, 0.24, 0.32]) {
      await executor.render(time);
      const pixels = await destination.read();
      rampDigests.add(digest(pixels));
      establishedPixels = Math.max(establishedPixels, visiblePixels(pixels));
      assert.equal(executor.hasAnimationDemand(), true);
      assert.equal(executor.effectResourceCount, 1);
    }
    const established = await executor.effectEmissionDiagnostics();
    assert.equal(established.length, 1);
    assert.equal(established[0].currentRate, established[0].targetRate);
    assert.ok(established[0].targetRate > 0);
    assert.ok(established[0].liveParticles > 0);
    assert.ok(establishedPixels > 0);
    assert.ok(rampDigests.size > 1, "persistent executor frames should animate during rate ramp");

    const sequenceBeforeUpdate = established[0].emissionSequence;
    const updatedRain = { ...rain, opacity: 0.55, color: { r: 170, g: 215, b: 255 } };
    assert.equal(engine.dispatch({ type: "effect.update", layerId, effectId: rain.id, effect: updatedRain }).ok, true);
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.4);
    const afterUpdate = (await executor.effectEmissionDiagnostics())[0];
    assert.ok(afterUpdate.liveParticles > 0);
    assert.ok(afterUpdate.emissionSequence >= sequenceBeforeUpdate);

    const hiddenRain = { ...updatedRain, visible: false };
    assert.equal(engine.dispatch({ type: "effect.update", layerId, effectId: rain.id, effect: hiddenRain }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.52);
    await executor.render(0.76);
    const stopped = (await executor.effectEmissionDiagnostics())[0];
    assert.equal(stopped.targetRate, 0);
    assert.equal(stopped.currentRate, 0);
    assert.ok(stopped.liveParticles > 0, "emitted particles survive after emission reaches zero");
    assert.ok(visiblePixels(await destination.read()) > 0, "draining particles remain visible after stop");
    assert.equal(executor.hasAnimationDemand(), true);
    assert.equal(executor.effectResourceCount, 1);

    await executor.render(2.2);
    const drained = await destination.read();
    assert.equal(visiblePixels(drained), 0);
    assert.equal(digest(drained), digest(baseline));
    assert.equal((await executor.effectEmissionDiagnostics()).length, 0);
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.effectGeometryResourceCount, 0);
    assert.equal(executor.hasAnimationDemand(), false);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("persistent editor executor renders unselected rain beyond overlay baseline and drains cleanly", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const layerId = "weather/editor-integration";
  const vertices = [{ x: 4, y: 4 }, { x: 34, y: 5 }, { x: 17, y: 11 }, { x: 6, y: 20 }];
  const rain = {
    id: "rain/editor-integration",
    kind: "rain" as const,
    name: "Editor integration rain",
    visible: true,
    vertices,
    seed: 9137,
    color: { r: 205, g: 225, b: 255 },
    opacity: 0.72,
    density: 2.4,
    speed: 10,
    dropSize: 0.65,
  };
  const initialScene = freezeSceneDocument({
    ...base,
    layers: [{ id: layerId, name: "Weather", type: "effects", visible: true, effects: [] }],
    assets: [],
  });
  const size = [640, 293] as const;
  const view = {
    kind: "editor" as const,
    table: initialScene.table,
    display: DEFAULT_DISPLAY,
    camera: { centerGrid: { x: 19, y: 12 }, cssPixelsPerGrid: 16 },
    viewportCss: { width: size[0], height: size[1] },
  };
  const projection = compileProjection(view, { width: size[0], height: size[1] });
  const engine = createSceneEngine(initialScene);
  const gpu = await init({ adapter: "auto", label: "rain-editor-emission-integration" });
  const destination = target(gpu, { size, format: "rgba8unorm", label: "rain-editor-emission-integration" });
  try {
    const executor = createSceneExecutor(gpu, destination, createRenderPlan("editor"), await loadSceneShaders(), view, engine.getSnapshot());
    executor.setGridVisible(false);
    await executor.prewarm();
    await executor.render(0);
    const baseline = await destination.read();

    assert.equal(engine.dispatch({ type: "effect.insert", layerId, effect: rain }).ok, true);
    engine.dispatch({ type: "effect.selection.set", selection: null });
    assert.equal(engine.getSnapshot().selectedEffect, null);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0);

    const changedInteriorPixels = (pixels: Uint8Array) => {
      let count = 0;
      const bins = new Set<string>();
      for (let y = 0; y < size[1]; y++) {
        for (let x = 0; x < size[0]; x++) {
          const grid = targetPxToGrid({ x: x + 0.5, y: y + 0.5 }, projection);
          if (!pointInPolygon(grid, vertices) || distanceToEdges(grid, vertices) < 1) continue;
          const offset = (y * size[0] + x) * 4;
          const difference = Math.max(
            Math.abs(pixels[offset] - baseline[offset]),
            Math.abs(pixels[offset + 1] - baseline[offset + 1]),
            Math.abs(pixels[offset + 2] - baseline[offset + 2]),
          );
          if (difference <= 8) continue;
          count++;
          bins.add(`${Math.floor(x / 80)}:${Math.floor(y / 73)}`);
        }
      }
      return { count, bins: bins.size };
    };

    const digests = new Set<string>();
    let strongest = { count: 0, bins: 0 };
    for (const time of [0.08, 0.16, 0.24, 0.32, 0.4]) {
      await executor.render(time);
      const pixels = await destination.read();
      digests.add(digest(pixels));
      const coverage = changedInteriorPixels(pixels);
      if (coverage.count > strongest.count) strongest = coverage;
      assert.equal(executor.hasAnimationDemand(), true);
    }
    const active = (await executor.effectEmissionDiagnostics())[0];
    assert.equal(active.currentRate, active.targetRate);
    assert.ok(active.liveParticles > 0);
    assert.ok(strongest.count >= 40, `${strongest.count} interior pixels should contain rain beyond the editor baseline`);
    assert.ok(strongest.bins >= 3, `${strongest.bins} interior spatial bins should contain rain, excluding a guide-only result`);
    assert.ok(digests.size > 1);

    const hidden = { ...rain, visible: false };
    assert.equal(engine.dispatch({ type: "effect.update", layerId, effectId: rain.id, effect: hidden }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.52);
    await executor.render(0.76);
    const stopped = (await executor.effectEmissionDiagnostics())[0];
    assert.equal(stopped.currentRate, 0);
    assert.equal(stopped.targetRate, 0);
    assert.ok(stopped.liveParticles > 0);
    assert.ok(changedInteriorPixels(await destination.read()).count > 0);

    await executor.render(2.2);
    const drained = await destination.read();
    assert.equal(digest(drained), digest(baseline));
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.hasAnimationDemand(), false);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("persistent editor executor keeps unselected rain visible after DPR 2 downsampling", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const layerId = "weather/editor-dpr2";
  const vertices = [{ x: 4, y: 4 }, { x: 34, y: 5 }, { x: 17, y: 11 }, { x: 6, y: 20 }];
  const rain = {
    id: "rain/editor-dpr2",
    kind: "rain" as const,
    name: "DPR 2 integration rain",
    visible: true,
    vertices,
    seed: 9137,
    color: { r: 205, g: 225, b: 255 },
    opacity: 0.72,
    density: 2.4,
    speed: 10,
    dropSize: 0.65,
  };
  const initialScene = freezeSceneDocument({
    ...base,
    layers: [{ id: layerId, name: "Weather", type: "effects", visible: true, effects: [] }],
    assets: [],
  });
  const viewportCss = { width: 640, height: 293 };
  const size = [1280, 586] as const;
  const view = {
    kind: "editor" as const,
    table: initialScene.table,
    display: DEFAULT_DISPLAY,
    camera: { centerGrid: { x: 19, y: 12 }, cssPixelsPerGrid: 16 },
    viewportCss,
  };
  const projection = compileProjection(view, { width: size[0], height: size[1] });
  assert.equal(projection.targetPixelsPerCssPixel, 2);
  const engine = createSceneEngine(initialScene);
  const gpu = await init({ adapter: "auto", label: "rain-editor-dpr2-integration" });
  const destination = target(gpu, { size, format: "rgba8unorm", label: "rain-editor-dpr2-integration" });
  try {
    const executor = createSceneExecutor(gpu, destination, createRenderPlan("editor"), await loadSceneShaders(), view, engine.getSnapshot());
    executor.setGridVisible(false);
    await executor.prewarm();
    await executor.render(0);
    const baseline = await destination.read();

    assert.equal(engine.dispatch({ type: "effect.insert", layerId, effect: rain }).ok, true);
    engine.dispatch({ type: "effect.selection.set", selection: null });
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0);

    let strongestCount = 0;
    let strongestBins = 0;
    const digests = new Set<string>();
    for (const time of [0.08, 0.16, 0.24, 0.32, 0.4]) {
      await executor.render(time);
      const pixels = await destination.read();
      digests.add(digest(pixels));
      let count = 0;
      const bins = new Set<string>();
      for (let cssY = 0; cssY < viewportCss.height; cssY++) {
        for (let cssX = 0; cssX < viewportCss.width; cssX++) {
          const targetX = cssX * 2;
          const targetY = cssY * 2;
          const grid = targetPxToGrid({ x: targetX + 1, y: targetY + 1 }, projection);
          if (!pointInPolygon(grid, vertices) || distanceToEdges(grid, vertices) < 1) continue;
          let difference = 0;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const offset = ((targetY + dy) * size[0] + targetX + dx) * 4;
              difference += Math.max(
                Math.abs(pixels[offset] - baseline[offset]),
                Math.abs(pixels[offset + 1] - baseline[offset + 1]),
                Math.abs(pixels[offset + 2] - baseline[offset + 2]),
              );
            }
          }
          if (difference / 4 <= 8) continue;
          count++;
          bins.add(`${Math.floor(cssX / 80)}:${Math.floor(cssY / 73)}`);
        }
      }
      if (count > strongestCount) {
        strongestCount = count;
        strongestBins = bins.size;
      }
      assert.equal(executor.hasAnimationDemand(), true);
    }
    const active = (await executor.effectEmissionDiagnostics())[0];
    assert.equal(active.currentRate, active.targetRate);
    assert.ok(active.liveParticles > 0);
    assert.ok(strongestCount >= 40, `${strongestCount} CSS pixels should retain interior rain after DPR 2 downsampling`);
    assert.ok(strongestBins >= 3, `${strongestBins} CSS-space bins should retain rain after DPR 2 downsampling`);
    assert.ok(digests.size > 1);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("persistent renderer emitter preserves live rain while density ramps up and down", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const layerId = "weather/density-regression";
  const rain = {
    id: "rain/density-regression",
    kind: "rain" as const,
    name: "Density regression rain",
    visible: true,
    vertices: [{ x: 4, y: 4 }, { x: 34, y: 4 }, { x: 34, y: 20 }, { x: 4, y: 20 }],
    seed: 7719,
    color: { r: 205, g: 225, b: 255 },
    opacity: 0.72,
    density: 2.4,
    speed: 10,
    dropSize: 0.65,
  };
  const scene = freezeSceneDocument({
    ...base,
    layers: [{ id: layerId, name: "Weather", type: "effects", visible: true, effects: [rain] }],
    assets: [],
  });
  const engine = createSceneEngine(scene);
  const gpu = await init({ adapter: "auto", label: "rain-density-regression" });
  const destination = target(gpu, { size: [384, 216], format: "rgba8unorm", label: "rain-density-regression" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(0);
    const initialPixels = await destination.read();
    const initial = (await executor.effectEmissionDiagnostics())[0];
    assert.ok(initial.liveParticles > 0);
    assert.ok(visiblePixels(initialPixels) > 0);
    const capacity = initial.capacity;

    const increase = { ...rain, density: 6 };
    const increaseToken = engine.beginPreview({ type: "effect.update", layerId, effectId: rain.id, effect: increase });
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0);
    await executor.render(0.12);
    const increasing = (await executor.effectEmissionDiagnostics())[0];
    assert.equal(increasing.capacity, capacity);
    assert.ok(increasing.currentRate > 0, "density increase must ramp from the established rate, not zero");
    assert.ok(increasing.targetRate > increasing.currentRate);
    assert.ok(increasing.emissionSequence >= initial.emissionSequence);
    assert.ok(increasing.liveParticles > 0);
    assert.ok(visiblePixels(await destination.read()) > 0);
    await executor.render(0.24);
    const increased = (await executor.effectEmissionDiagnostics())[0];
    assert.ok(Math.abs(increased.currentRate - increased.targetRate) < 0.01);
    assert.ok(increased.emissionSequence >= increasing.emissionSequence);
    assert.equal(engine.commitPreview(increaseToken).ok, true);

    const decrease = { ...increase, density: 1.2 };
    const decreaseToken = engine.beginPreview({ type: "effect.update", layerId, effectId: rain.id, effect: decrease });
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.24);
    await executor.render(0.36);
    const decreasing = (await executor.effectEmissionDiagnostics())[0];
    assert.equal(decreasing.capacity, capacity);
    assert.ok(decreasing.currentRate > decreasing.targetRate);
    assert.ok(decreasing.targetRate > 0);
    assert.ok(decreasing.emissionSequence >= increased.emissionSequence);
    assert.ok(decreasing.liveParticles > 0);
    assert.ok(visiblePixels(await destination.read()) > 0);
    await executor.render(0.48);
    const decreased = (await executor.effectEmissionDiagnostics())[0];
    assert.ok(Math.abs(decreased.currentRate - decreased.targetRate) < 0.01);
    assert.ok(decreased.liveParticles > 0);
    assert.equal(engine.commitPreview(decreaseToken).ok, true);

    const visualUpdate = { ...decrease, color: { r: 160, g: 210, b: 255 }, opacity: 0.6, dropSize: 0.8 };
    assert.equal(engine.dispatch({ type: "effect.update", layerId, effectId: rain.id, effect: visualUpdate }).ok, true);
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.56);
    const updated = (await executor.effectEmissionDiagnostics())[0];
    assert.equal(updated.capacity, capacity);
    assert.ok(updated.emissionSequence >= decreased.emissionSequence);
    assert.ok(updated.liveParticles > 0);
    assert.ok(visiblePixels(await destination.read()) > 0);

    const retimeAt = 0.56;
    const phasesBeforeRetime = new Map(updated.liveParticleRecords.map((particle) => [
      particle.initializationSeed,
      (retimeAt - particle.spawnTime) / particle.lifetime,
    ]));
    const slow = { ...visualUpdate, speed: 0.5 };
    const slowToken = engine.beginPreview({ type: "effect.update", layerId, effectId: rain.id, effect: slow });
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.56);
    await executor.render(0.68);
    const slowed = (await executor.effectEmissionDiagnostics())[0];
    const priorSlowLifetime = 1 / (slow.speed * 0.75 * 0.48);
    const slowLifetime = 1 / (slow.speed * 0.45 * 0.48);
    assert.ok(slowLifetime / priorSlowLifetime >= 1.5 && slowLifetime / priorSlowLifetime <= 2.2);
    assert.equal(slowed.capacity, capacity);
    assert.ok(Math.abs(slowed.particleLifetime - slowLifetime) < 0.001);
    assert.ok(slowed.liveParticleLifetimes.every((lifetime) => Math.abs(lifetime - slowLifetime) < 0.001), "retime updates every live and future particle lifetime");
    for (const particle of slowed.liveParticleRecords) {
      const previousPhase = phasesBeforeRetime.get(particle.initializationSeed);
      if (previousPhase === undefined) continue;
      assert.ok(Math.abs((retimeAt - particle.spawnTime) / particle.lifetime - previousPhase) < 0.0001, "retime preserves normalized phase exactly");
    }
    assert.ok(slowed.emissionSequence >= updated.emissionSequence);
    assert.ok(slowed.liveParticles > 0);
    assert.ok(visiblePixels(await destination.read()) > 0);
    assert.equal(engine.commitPreview(slowToken).ok, true);

    const fast = { ...slow, speed: 20 };
    const fastToken = engine.beginPreview({ type: "effect.update", layerId, effectId: rain.id, effect: fast });
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.68);
    await executor.render(0.8);
    const accelerated = (await executor.effectEmissionDiagnostics())[0];
    const fastLifetime = 1 / (fast.speed * 0.45 * 0.48);
    assert.equal(accelerated.capacity, capacity);
    assert.ok(Math.abs(accelerated.particleLifetime - fastLifetime) < 0.001);
    assert.ok(accelerated.liveParticleLifetimes.every((lifetime) => Math.abs(lifetime - fastLifetime) < 0.001), "acceleration retimes all live and future particles");
    assert.ok(accelerated.emissionSequence >= slowed.emissionSequence);
    assert.ok(accelerated.liveParticles > 0);
    assert.ok(visiblePixels(await destination.read()) > 0);
    assert.equal(engine.commitPreview(fastToken).ok, true);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("rain contexts snapshot table center for steady state and only new particles after view changes", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const layerId = "weather/context-lifecycle";
  const rain = {
    id: "rain/context-lifecycle",
    kind: "rain" as const,
    name: "Context lifecycle rain",
    visible: true,
    vertices: [{ x: 12, y: 8 }, { x: 16, y: 8 }, { x: 16, y: 12 }, { x: 12, y: 12 }],
    seed: 8128,
    color: { r: 205, g: 225, b: 255 },
    opacity: 0.72,
    density: 1,
    speed: 0.5,
    dropSize: 0.65,
  };
  const scene = freezeSceneDocument({
    ...base,
    layers: [{ id: layerId, name: "Weather", type: "effects", visible: true, effects: [rain] }],
    assets: [],
  });
  const view = { kind: "output" as const, table: scene.table, display: DEFAULT_DISPLAY };
  const engine = createSceneEngine(scene);
  const gpu = await init({ adapter: "auto", label: "rain-context-lifecycle" });
  const destination = target(gpu, { size: [384, 216], format: "rgba8unorm", label: "rain-context-lifecycle" });
  try {
    const executor = createSceneExecutor(gpu, destination, createRenderPlan("output"), await loadSceneShaders(), view, engine.getSnapshot());
    await executor.prewarm();
    await executor.render(0);
    const originalCenter = rainVanishingPoint(view.table, view.display);
    const initial = (await executor.effectEmissionDiagnostics())[0];
    assert.ok(initial.liveParticleRecords.length > 2);
    assert.ok(initial.liveParticleRecords.every((record) =>
      record.contextInitializationSeed === record.initializationSeed && closePoint(record.vanishingPoint, originalCenter)
    ), "steady-state particles snapshot the original physical table center");

    const initialSeeds = new Set(initial.liveParticleRecords.map((record) => record.initializationSeed));
    const movedTable = {
      ...view.table,
      originGrid: { x: view.table.originGrid.x + 8, y: view.table.originGrid.y - 3 },
    };
    const movedCenter = rainVanishingPoint(movedTable, view.display);
    executor.setView({ ...view, table: movedTable });
    await executor.render(0.3);
    const moved = (await executor.effectEmissionDiagnostics())[0];
    const retained = moved.liveParticleRecords.filter((record) => initialSeeds.has(record.initializationSeed));
    const emitted = moved.liveParticleRecords.filter((record) => !initialSeeds.has(record.initializationSeed));
    assert.ok(retained.length > 0 && emitted.length > 0);
    assert.ok(retained.every((record) => closePoint(record.vanishingPoint, originalCenter)), "old particles retain their emitted center");
    assert.ok(emitted.every((record) => closePoint(record.vanishingPoint, movedCenter)), "new particles snapshot the moved table center");

    const contextsBeforeUpdates = new Map(moved.liveParticleRecords.map((record) => [record.initializationSeed, record.vanishingPoint]));
    const denser = { ...rain, density: 2 };
    assert.equal(engine.dispatch({ type: "effect.update", layerId, effectId: rain.id, effect: denser }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.3);
    const faster = { ...denser, speed: 20 };
    assert.equal(engine.dispatch({ type: "effect.update", layerId, effectId: rain.id, effect: faster }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.3);
    const updated = (await executor.effectEmissionDiagnostics())[0];
    for (const record of updated.liveParticleRecords) {
      const previous = contextsBeforeUpdates.get(record.initializationSeed);
      if (previous) assert.ok(closePoint(record.vanishingPoint, previous), "density and speed updates preserve matching particle contexts");
    }
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("rain context follows initialization seed when a ring slot is reused", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const rain = {
    id: "rain/context-ring",
    kind: "rain" as const,
    name: "Context ring rain",
    visible: true,
    vertices: [{ x: 10, y: 10 }, { x: 10.5, y: 10 }, { x: 10.5, y: 10.5 }, { x: 10, y: 10.5 }],
    seed: 1776,
    color: { r: 205, g: 225, b: 255 },
    opacity: 0.72,
    density: 8,
    speed: 20,
    dropSize: 0.65,
  };
  const scene = freezeSceneDocument({
    ...base,
    layers: [{ id: "weather/context-ring", name: "Weather", type: "effects", visible: true, effects: [rain] }],
    assets: [],
  });
  const view = { kind: "output" as const, table: scene.table, display: DEFAULT_DISPLAY };
  const engine = createSceneEngine(scene);
  const gpu = await init({ adapter: "auto", label: "rain-context-ring" });
  const destination = target(gpu, { size: [192, 108], format: "rgba8unorm", label: "rain-context-ring" });
  try {
    const executor = createSceneExecutor(gpu, destination, createRenderPlan("output"), await loadSceneShaders(), view, engine.getSnapshot());
    await executor.prewarm();
    await executor.render(0);
    const initial = (await executor.effectEmissionDiagnostics())[0];
    const original = initial.particleContextRecords.find((record) => record.initialized);
    assert.ok(original);

    const movedTable = { ...view.table, originGrid: { x: view.table.originGrid.x + 5, y: view.table.originGrid.y + 4 } };
    const movedCenter = rainVanishingPoint(movedTable, view.display);
    executor.setView({ ...view, table: movedTable });
    await executor.render(13);
    const reused = (await executor.effectEmissionDiagnostics())[0].particleContextRecords[original.slotIndex];
    assert.notEqual(reused.particleInitializationSeed, original.particleInitializationSeed);
    assert.equal(reused.contextInitializationSeed, reused.particleInitializationSeed);
    assert.equal(reused.initialized, true);
    assert.ok(closePoint(reused.vanishingPoint, movedCenter), "reused slot snapshots the current table center");
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("scene switch hard-resets live rain before the first empty-scene frame", { timeout: 60_000 }, async () => {
  const rain = switchRain("rain/shared", 404, [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 20, y: 16 }, { x: 4, y: 16 }]);
  const sceneA = switchScene("scene/a-empty-switch", [rain]);
  const sceneB = switchScene("scene/b-empty-switch", []);
  const engineA = createSceneEngine(sceneA);
  const engineB = createSceneEngine(sceneB);
  const gpu = await init({ adapter: "auto", label: "rain-scene-switch-empty" });
  const destination = target(gpu, { size: [384, 216], format: "rgba8unorm", label: "rain-scene-switch-empty" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: sceneA.table, display: DEFAULT_DISPLAY }, engineA.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(0);
    assert.ok(visiblePixels(await destination.read()) > 0);
    assert.ok((await executor.effectEmissionDiagnostics()).some((entry) => entry.liveParticles > 0));

    const nextSnapshot = engineB.getSnapshot();
    await executor.replaceEffects(nextSnapshot);
    executor.setSnapshot(nextSnapshot);
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.effectGeometryResourceCount, 0);
    assert.deepEqual(await executor.effectEmissionDiagnostics(), []);
    assert.equal(executor.hasAnimationDemand(), false);
    await executor.render(0.2);
    assert.equal(visiblePixels(await destination.read()), 0, "old scene particles must not reach the first new-scene frame");
  } finally {
    engineA.dispose();
    engineB.dispose();
    gpu.dispose();
  }
});

test("scene switch rebuilds identical rain IDs and data with fresh emitter context", { timeout: 60_000 }, async () => {
  const rain = switchRain("rain/shared", 405, [{ x: 5, y: 5 }, { x: 17, y: 5 }, { x: 17, y: 13 }, { x: 5, y: 13 }]);
  const sceneA = switchScene("scene/a-identical-switch", [rain]);
  const sceneB = switchScene("scene/b-identical-switch", [rain]);
  const engineA = createSceneEngine(sceneA);
  const engineB = createSceneEngine(sceneB);
  const gpu = await init({ adapter: "auto", label: "rain-scene-switch-identical" });
  const destination = target(gpu, { size: [384, 216], format: "rgba8unorm", label: "rain-scene-switch-identical" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: sceneA.table, display: DEFAULT_DISPLAY }, engineA.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(0);
    await executor.render(0.5);
    const before = (await executor.effectEmissionDiagnostics(0.5))[0];

    const nextSnapshot = engineB.getSnapshot();
    await executor.replaceEffects(nextSnapshot);
    executor.setSnapshot(nextSnapshot);
    await executor.render(0.5);
    const after = (await executor.effectEmissionDiagnostics(0.5))[0];
    assert.equal(executor.effectResourceCount, 1);
    assert.equal(after.effectId, rain.id);
    assert.ok(after.liveParticles > 0);
    assert.ok(after.emissionSequence < before.emissionSequence, "new scene must not inherit the advanced emission sequence");
    assert.notDeepEqual(
      after.liveParticleRecords.map((record) => [record.initializationSeed, record.spawnTime]),
      before.liveParticleRecords.map((record) => [record.initializationSeed, record.spawnTime]),
      "new scene must hydrate a fresh particle generation",
    );
    assert.ok(after.liveParticleRecords.every((record) => record.contextInitializationSeed === record.initializationSeed));
  } finally {
    engineA.dispose();
    engineB.dispose();
    gpu.dispose();
  }
});

test("scene switch renders only the new scene effect order and matches a fresh executor", { timeout: 60_000 }, async () => {
  const sceneA = switchScene("scene/a-different-switch", [
    switchRain("rain/a", 406, [{ x: 2, y: 3 }, { x: 12, y: 3 }, { x: 12, y: 10 }, { x: 2, y: 10 }]),
  ]);
  const sceneB = switchScene("scene/b-different-switch", [
    switchRain("rain/b-first", 407, [{ x: 18, y: 4 }, { x: 28, y: 4 }, { x: 28, y: 11 }, { x: 18, y: 11 }]),
    switchRain("rain/b-second", 408, [{ x: 8, y: 12 }, { x: 18, y: 12 }, { x: 18, y: 19 }, { x: 8, y: 19 }]),
  ]);
  const shaders = await loadSceneShaders();
  const renderFresh = async () => {
    const gpu = await init({ adapter: "auto", label: "rain-scene-switch-fresh-b" });
    const destination = target(gpu, { size: [384, 216], format: "rgba8unorm", label: "rain-scene-switch-fresh-b" });
    const engine = createSceneEngine(sceneB);
    try {
      const executor = createSceneExecutor(
        gpu, destination, createRenderPlan("output"), shaders,
        { kind: "output", table: sceneB.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
      );
      await executor.prewarm();
      await executor.render(0.5);
      return { pixels: await destination.read(), ids: (await executor.effectEmissionDiagnostics(0.5)).map((entry) => entry.effectId) };
    } finally {
      engine.dispose();
      gpu.dispose();
    }
  };
  const fresh = await renderFresh();
  const engineA = createSceneEngine(sceneA);
  const engineB = createSceneEngine(sceneB);
  const gpu = await init({ adapter: "auto", label: "rain-scene-switch-different" });
  const destination = target(gpu, { size: [384, 216], format: "rgba8unorm", label: "rain-scene-switch-different" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), shaders,
      { kind: "output", table: sceneA.table, display: DEFAULT_DISPLAY }, engineA.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(0);
    const nextSnapshot = engineB.getSnapshot();
    await executor.replaceEffects(nextSnapshot);
    executor.setSnapshot(nextSnapshot);
    await executor.render(0.5);
    const diagnostics = await executor.effectEmissionDiagnostics(0.5);
    assert.equal(executor.effectResourceCount, 2);
    assert.deepEqual(diagnostics.map((entry) => entry.effectId), ["rain/b-first", "rain/b-second"]);
    assert.deepEqual(diagnostics.map((entry) => entry.effectId), fresh.ids);
    assert.equal(diagnostics.some((entry) => entry.effectId === "rain/a"), false);
    assert.equal(digest(await destination.read()), digest(fresh.pixels), "switched B frame should equal a fresh B executor frame");
  } finally {
    engineA.dispose();
    engineB.dispose();
    gpu.dispose();
  }
});
