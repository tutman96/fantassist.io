import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { init, target } from "vgpu/node";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import type { CloudEffect } from "../src/engine/scene-document";
import { createSceneEngine } from "../src/engine/scene-engine";
import { DEFAULT_DISPLAY, getTableBounds } from "../src/engine/table-camera";
import { createRenderPlan } from "../src/renderer/render-plan";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { loadSceneShaders } from "../scripts/load-scene-shaders";
import { renderHeadlessScene } from "../scripts/render-scene";

const digest = (pixels: Uint8Array) => createHash("sha256").update(pixels).digest("hex");

function cloudScene(color = { r: 96, g: 101, b: 110 }) {
  const base = createSampleSceneDocument();
  return freezeSceneDocument({
    ...base,
    layers: [{
      id: "effects",
      name: "Effects",
      type: "effects",
      visible: true,
      effects: [{
        id: "cloud",
        kind: "cloud",
        name: "Cloud",
        visible: true,
        vertices: [{ x: 8, y: 6 }, { x: 32, y: 6 }, { x: 32, y: 20 }, { x: 8, y: 20 }],
        seed: 8172,
        color,
        opacity: 0.72,
        coverage: 0.62,
        speed: 0.22,
        scale: 3.2,
        turbulence: 0.7,
      }],
    }],
    assets: [],
  });
}

function updateCloud(scene: ReturnType<typeof cloudScene>, update: Partial<CloudEffect>) {
  return freezeSceneDocument({
    ...scene,
    layers: scene.layers.map((layer) => layer.type === "effects" ? {
      ...layer,
      effects: layer.effects.map((effect) => effect.kind === "cloud" ? { ...effect, ...update } : effect),
    } : layer),
  });
}

test("clouds animate deterministically in top-down world space and stay inside their polygon", { timeout: 60_000 }, async () => {
  const scene = cloudScene();
  const size = [512, 288] as const;
  const render = (time: number) => renderHeadlessScene({ adapter: "auto", profile: "output", size, time, scene });
  const first = await render(2.5);
  const repeated = await render(2.5);
  const later = await render(5);
  assert.equal(digest(first.pixels), digest(repeated.pixels));
  assert.notEqual(digest(first.pixels), digest(later.pixels));

  const bounds = getTableBounds(scene.table, DEFAULT_DISPLAY);
  let inside = 0;
  let outside = 0;
  let edgePeak = 0;
  let centerPeak = 0;
  for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) {
    const offset = (y * size[0] + x) * 4;
    const value = Math.max(first.pixels[offset], first.pixels[offset + 1], first.pixels[offset + 2]);
    const gridX = bounds.left + (x + 0.5) / size[0] * bounds.width;
    const gridY = bounds.top + (y + 0.5) / size[1] * bounds.height;
    const contained = gridX >= 8 && gridX <= 32 && gridY >= 6 && gridY <= 20;
    if (value > 3 && contained) inside++;
    if (value > 3 && !contained) outside++;
    if (contained && (gridX < 8.5 || gridX > 31.5 || gridY < 6.5 || gridY > 19.5)) edgePeak = Math.max(edgePeak, value);
    if (gridX > 13 && gridX < 27 && gridY > 10 && gridY < 16) centerPeak = Math.max(centerPeak, value);
  }
  assert.ok(inside > 1_000, `${inside} pixels should contain cloud density`);
  assert.equal(outside, 0);
  assert.ok(edgePeak < centerPeak, `soft edge peak ${edgePeak} should remain below center peak ${centerPeak}`);
});

test("one cloud shader supports distinct color variants", { timeout: 60_000 }, async () => {
  const options = { adapter: "auto", profile: "output", size: [256, 144], time: 3.5 } as const;
  const smoke = await renderHeadlessScene({ ...options, scene: cloudScene() });
  const poison = await renderHeadlessScene({ ...options, scene: cloudScene({ r: 70, g: 190, b: 75 }) });
  assert.notEqual(digest(smoke.pixels), digest(poison.pixels));
  let greenDominant = 0;
  for (let offset = 0; offset < poison.pixels.length; offset += 4) {
    if (poison.pixels[offset + 1] > poison.pixels[offset] + 8 && poison.pixels[offset + 1] > poison.pixels[offset + 2] + 8) greenDominant++;
  }
  assert.ok(greenDominant > 100, `${greenDominant} poison-cloud pixels should be green-dominant`);
});

test("cloud coverage zero is empty and adjacent high uint32 seeds remain distinct", { timeout: 60_000 }, async () => {
  const base = cloudScene();
  const options = { adapter: "auto", profile: "output", size: [256, 144], time: 3.5 } as const;
  const empty = await renderHeadlessScene({ ...options, scene: updateCloud(base, { coverage: 0 }) });
  assert.equal(empty.pixels.some((value, index) => index % 4 !== 3 && value > 3), false);

  const lower = await renderHeadlessScene({ ...options, scene: updateCloud(base, { seed: 16_777_216 }) });
  const upper = await renderHeadlessScene({ ...options, scene: updateCloud(base, { seed: 16_777_217 }) });
  assert.notEqual(digest(lower.pixels), digest(upper.pixels));
});

test("procedural clouds update live parameters and fade resources in and out", { timeout: 60_000 }, async () => {
  const complete = cloudScene();
  const cloudLayer = complete.layers[0];
  assert.equal(cloudLayer.type, "effects");
  const cloud = cloudLayer.effects[0];
  assert.equal(cloud.kind, "cloud");
  const initial = freezeSceneDocument({ ...complete, layers: [{ ...cloudLayer, effects: [] }] });
  const engine = createSceneEngine(initial);
  const gpu = await init({ adapter: "auto", label: "cloud-lifecycle" });
  const destination = target(gpu, { size: [256, 144], format: "rgba8unorm" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: initial.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(0);
    const baseline = await destination.read();
    assert.equal(engine.dispatch({ type: "effect.insert", layerId: cloudLayer.id, effect: cloud }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0);
    assert.equal(digest(await destination.read()), digest(baseline));
    await executor.render(0.12);
    const entering = await destination.read();
    await executor.render(0.24);
    const full = await destination.read();
    assert.notEqual(digest(entering), digest(baseline));
    assert.notEqual(digest(full), digest(entering));
    assert.equal(executor.effectResourceCount, 1);
    assert.deepEqual(await executor.effectEmissionDiagnostics(), []);

    const changed = { ...cloud, color: { r: 70, g: 190, b: 75 }, coverage: 0.75, scale: 4 };
    assert.equal(engine.dispatch({ type: "effect.update", layerId: cloudLayer.id, effectId: cloud.id, effect: changed }).ok, true);
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.24);
    assert.notEqual(digest(await destination.read()), digest(full));

    assert.equal(engine.dispatch({ type: "effect.update", layerId: cloudLayer.id, effectId: cloud.id, effect: { ...changed, visible: false } }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.36);
    assert.equal(executor.effectResourceCount, 1);
    await executor.render(0.48);
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.hasAnimationDemand(), false);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});
