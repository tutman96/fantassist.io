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
    sparkDensity: 1.2,
    sparkSize: 0.1,
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

test("Wall of Fire width controls body thickness independently of sparks", { timeout: 60_000 }, async () => {
  const options = { adapter: "auto", profile: "output", size: [384, 216], time: 2.5 } as const;
  const narrow = await renderHeadlessScene({ ...options, scene: fireScene({ width: 0.4, sparkDensity: 0 }) });
  const wide = await renderHeadlessScene({ ...options, scene: fireScene({ width: 2.4, sparkDensity: 0 }) });
  assert.ok(visiblePixels(wide.pixels) > visiblePixels(narrow.pixels) * 2);
});

test("Wall of Fire emits path-length sparks and drains after its body fades", { timeout: 60_000 }, async () => {
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
    const active = (await executor.effectEmissionDiagnostics())[0];
    assert.ok(active.targetRate > 0);
    assert.ok(active.liveParticles > 0);
    const sparkOrigins = active.particleContextRecords.filter((record) => record.initialized).map((record) => record.contextPoint);
    assert.ok(sparkOrigins.some(([x, y]) => y > 6.99 && y < 7.01 && x < 30));
    assert.ok(sparkOrigins.some(([x, y]) => x > 30.99 && x < 31.01 && y > 8));
    assert.equal(executor.effectResourceCount, 1);

    const layer = engine.getSnapshot().scene.layers[0];
    assert.equal(layer.type, "effects");
    const fire = layer.effects[0];
    assert.equal(fire.kind, "wall-of-fire");
    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: fire.id, effect: { ...fire, visible: false } }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.24);
    assert.equal(executor.effectResourceCount, 1);
    assert.ok((await executor.effectEmissionDiagnostics())[0].liveParticles > 0);
    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: fire.id, effect: fire }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.36);
    assert.equal(executor.effectResourceCount, 1);
    assert.ok((await executor.effectEmissionDiagnostics())[0].targetRate > 0);
    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: fire.id, effect: { ...fire, visible: false } }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.6);
    await executor.render(5);
    await executor.render(7);
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.hasAnimationDemand(), false);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});
