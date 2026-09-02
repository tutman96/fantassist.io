import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { init, target } from "vgpu/node";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import type { WallOfFireEffect } from "../src/engine/scene-document";
import { createSceneEngine } from "../src/engine/scene-engine";
import { DEFAULT_DISPLAY, getTableBounds } from "../src/engine/table-camera";
import { createRenderPlan } from "../src/renderer/render-plan";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { loadSceneShaders } from "../scripts/load-scene-shaders";
import { renderHeadlessScene } from "../scripts/render-scene";

const digest = (pixels: Uint8Array) => createHash("sha256").update(pixels).digest("hex");

function fireScene(update: Partial<WallOfFireEffect> = {}) {
  const base = createSampleSceneDocument();
  const fire: WallOfFireEffect = {
    id: "wall-of-fire",
    kind: "wall-of-fire",
    name: "Wall of Fire",
    visible: true,
    vertices: [{ x: 8, y: 7 }, { x: 31, y: 7 }, { x: 31, y: 20 }],
    seed: 71237,
    color: { r: 255, g: 91, b: 24 },
    opacity: 0.9,
    width: 1.2,
    intensity: 0.86,
    speed: 1.3,
    turbulence: 0.7,
    ...update,
  };
  return freezeSceneDocument({
    ...base,
    layers: [{ id: "effects", name: "Effects", type: "effects", visible: true, effects: [fire] }],
    assets: [],
  });
}

function visiblePixels(pixels: Uint8Array): number {
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset] > 3 || pixels[offset + 1] > 3 || pixels[offset + 2] > 3) count++;
  }
  return count;
}

test("Wall of Fire is deterministic, animated, and never closes its open path", { timeout: 60_000 }, async () => {
  const scene = fireScene();
  const size = [512, 288] as const;
  const render = (time: number) => renderHeadlessScene({ adapter: "auto", profile: "output", size, time, scene });
  const first = await render(2.5);
  const repeated = await render(2.5);
  const later = await render(3.25);
  assert.equal(digest(first.pixels), digest(repeated.pixels));
  assert.notEqual(digest(first.pixels), digest(later.pixels));
  assert.ok(visiblePixels(first.pixels) > 500);

  const bounds = getTableBounds(scene.table, DEFAULT_DISPLAY);
  let unintendedClosingPixels = 0;
  for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) {
    const gridX = bounds.left + (x + 0.5) / size[0] * bounds.width;
    const gridY = bounds.top + (y + 0.5) / size[1] * bounds.height;
    if (Math.hypot(gridX - 19.5, gridY - 13.5) > 1) continue;
    const offset = (y * size[0] + x) * 4;
    if (Math.max(first.pixels[offset], first.pixels[offset + 1], first.pixels[offset + 2]) > 3) unintendedClosingPixels++;
  }
  assert.equal(unintendedClosingPixels, 0);
});

test("Wall of Fire width controls resolved body thickness", { timeout: 60_000 }, async () => {
  const options = { adapter: "auto", profile: "output", size: [384, 216], time: 2.5 } as const;
  const narrow = await renderHeadlessScene({ ...options, scene: fireScene({ width: 0.4 }) });
  const wide = await renderHeadlessScene({ ...options, scene: fireScene({ width: 2.4 }) });
  assert.ok(visiblePixels(wide.pixels) > visiblePixels(narrow.pixels) * 2);
});

test("Wall of Fire applies authored color across the continuous flame palette", { timeout: 60_000 }, async () => {
  const options = { adapter: "auto", profile: "output", size: [384, 216], time: 2.5 } as const;
  const orange = await renderHeadlessScene({ ...options, scene: fireScene() });
  const blue = await renderHeadlessScene({ ...options, scene: fireScene({ color: { r: 35, g: 95, b: 255 } }) });
  assert.notEqual(digest(orange.pixels), digest(blue.pixels));
  let blueDominant = 0;
  for (let offset = 0; offset < blue.pixels.length; offset += 4) {
    if (blue.pixels[offset + 2] > blue.pixels[offset] + 8) blueDominant++;
  }
  assert.ok(blueDominant > 100, `${blueDominant} pixels should reflect the authored blue fire color`);
});

test("multiple Walls of Fire retain independent colors and draw state", { timeout: 60_000 }, async () => {
  const source = fireScene();
  const layer = source.layers[0];
  assert.equal(layer.type, "effects");
  const fire = layer.effects[0];
  assert.equal(fire.kind, "wall-of-fire");
  const scene = freezeSceneDocument({
    ...source,
    layers: [{
      ...layer,
      effects: [
        { ...fire, vertices: [{ x: 8, y: 7 }, { x: 31, y: 7 }], color: { r: 255, g: 70, b: 15 } },
        { ...fire, id: "wall-of-fire/blue", vertices: [{ x: 8, y: 18 }, { x: 31, y: 18 }], color: { r: 35, g: 95, b: 255 } },
      ],
    }],
  });
  const size = [512, 288] as const;
  const rendered = await renderHeadlessScene({ adapter: "auto", profile: "output", size, time: 2.5, scene });
  const bounds = getTableBounds(scene.table, DEFAULT_DISPLAY);
  let redDominant = 0;
  let blueDominant = 0;
  for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) {
    const gridY = bounds.top + (y + 0.5) / size[1] * bounds.height;
    const offset = (y * size[0] + x) * 4;
    const red = rendered.pixels[offset];
    const blue = rendered.pixels[offset + 2];
    if (Math.abs(gridY - 7) < 2 && red > blue + 8) redDominant++;
    if (Math.abs(gridY - 18) < 2 && blue > red + 8) blueDominant++;
  }
  assert.ok(redDominant > 100, `${redDominant} pixels should retain the first wall's red color`);
  assert.ok(blueDominant > 100, `${blueDominant} pixels should retain the second wall's blue color`);
});

test("procedural Wall of Fire reverses visibility transitions and retires without emitter resources", { timeout: 60_000 }, async () => {
  const scene = fireScene();
  const engine = createSceneEngine(scene);
  const gpu = await init({ adapter: "auto", label: "wall-of-fire-lifecycle" });
  const destination = target(gpu, { size: [384, 216], format: "rgba8unorm" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(0);
    assert.deepEqual(await executor.effectEmissionDiagnostics(), []);
    assert.equal(executor.effectResourceCount, 1);

    const layer = engine.getSnapshot().scene.layers[0];
    assert.equal(layer.type, "effects");
    const fire = layer.effects[0];
    assert.equal(fire.kind, "wall-of-fire");
    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: fire.id, effect: { ...fire, visible: false } }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.12);
    assert.equal(executor.effectResourceCount, 1);
    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: fire.id, effect: fire }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.18);
    assert.equal(executor.effectResourceCount, 1);
    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: fire.id, effect: { ...fire, visible: false } }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.3);
    await executor.render(0.54);
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.hasAnimationDemand(), false);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});
