import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { init, target } from "vgpu/node";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { createSceneEngine } from "../src/engine/scene-engine";
import { DEFAULT_DISPLAY, getTableBounds } from "../src/engine/table-camera";
import { createRenderPlan } from "../src/renderer/render-plan";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { loadSceneShaders } from "../scripts/load-scene-shaders";
import { renderHeadlessScene } from "../scripts/render-scene";

const digest = (pixels: Uint8Array) => createHash("sha256").update(pixels).digest("hex");

function embersScene() {
  const base = createSampleSceneDocument();
  return freezeSceneDocument({
    ...base,
    layers: [{
      id: "effects",
      name: "Effects",
      type: "effects",
      visible: true,
      effects: [{
        id: "embers",
        kind: "embers",
        name: "Embers",
        visible: true,
        vertices: [{ x: 8, y: 11 }, { x: 32, y: 11 }, { x: 32, y: 19 }, { x: 8, y: 19 }],
        seed: 9173,
        color: { r: 255, g: 106, b: 32 },
        opacity: 0.82,
        density: 3,
        speed: 1.2,
        particleSize: 0.14,
      }],
    }],
    assets: [],
  });
}

test("top-down embers produce deterministic warm particles with planar convection beyond their source area", { timeout: 60_000 }, async () => {
  const scene = embersScene();
  const size = [512, 288] as const;
  const options = { adapter: "auto", profile: "output", size, time: 3.25, scene } as const;
  const first = await renderHeadlessScene(options);
  const second = await renderHeadlessScene(options);
  assert.equal(digest(first.pixels), digest(second.pixels));

  const bounds = getTableBounds(scene.table, DEFAULT_DISPLAY);
  let visible = 0;
  let warm = 0;
  let beyondSource = 0;
  for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) {
    const offset = (y * size[0] + x) * 4;
    const red = first.pixels[offset];
    const green = first.pixels[offset + 1];
    const blue = first.pixels[offset + 2];
    if (Math.max(red, green, blue) <= 3) continue;
    visible++;
    if (red > blue && green >= blue) warm++;
    const gridX = bounds.left + (x + 0.5) / size[0] * bounds.width;
    const gridY = bounds.top + (y + 0.5) / size[1] * bounds.height;
    if (gridX < 7.85 || gridX > 32.15 || gridY < 10.85 || gridY > 19.15) beyondSource++;
  }
  assert.ok(visible > 100, `${visible} pixels should contain embers`);
  assert.ok(warm > visible * 0.8, `${warm}/${visible} visible pixels should retain a warm spectrum`);
  assert.ok(beyondSource > 10, `${beyondSource} pixels should convect beyond the source polygon`);
});

test("mixed rain and embers use shared resources while retaining kind-specific context", { timeout: 60_000 }, async () => {
  const scene = embersScene();
  const effectsLayer = scene.layers[0];
  assert.equal(effectsLayer.type, "effects");
  const mixed = freezeSceneDocument({
    ...scene,
    layers: [{ ...effectsLayer, effects: [{
      id: "rain",
      kind: "rain",
      name: "Rain",
      visible: true,
      vertices: effectsLayer.effects[0].vertices,
      seed: 42,
      color: { r: 180, g: 210, b: 255 },
      opacity: 0.6,
      density: 2,
      speed: 8,
      dropSize: 0.3,
    }, effectsLayer.effects[0]] }],
  });
  const engine = createSceneEngine(mixed);
  const gpu = await init({ adapter: "auto", label: "mixed-particle-effects" });
  const destination = target(gpu, { size: [256, 144], format: "rgba8unorm" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: mixed.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(2);
    assert.equal(executor.effectResourceCount, 2);
    const diagnostics = await executor.effectEmissionDiagnostics(2);
    assert.deepEqual(diagnostics.map((entry) => entry.effectId), ["rain", "embers"]);
    assert.ok(diagnostics[0].particleContextRecords.length > 0);
    assert.equal(diagnostics[1].particleContextRecords.length, 0);
    assert.ok(diagnostics.every((entry) => entry.liveParticles > 0));
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});

test("mixed rain and embers retain authored draw order", { timeout: 60_000 }, async () => {
  const scene = embersScene();
  const layer = scene.layers[0];
  assert.equal(layer.type, "effects");
  const rain = {
    id: "rain",
    kind: "rain" as const,
    name: "Rain",
    visible: true,
    vertices: layer.effects[0].vertices,
    seed: 42,
    color: { r: 180, g: 210, b: 255 },
    opacity: 0.75,
    density: 5,
    speed: 8,
    dropSize: 0.5,
  };
  const render = (effects: typeof layer.effects) => renderHeadlessScene({
    adapter: "auto",
    profile: "output",
    size: [256, 144],
    time: 2.5,
    scene: freezeSceneDocument({ ...scene, layers: [{ ...layer, effects }] }),
  });
  const rainThenEmbers = await render([rain, layer.effects[0]]);
  const embersThenRain = await render([layer.effects[0], rain]);
  assert.notEqual(digest(rainThenEmbers.pixels), digest(embersThenRain.pixels));
});

test("embers update live uniforms, reactivate while draining, and retire without context storage", { timeout: 60_000 }, async () => {
  const scene = embersScene();
  const engine = createSceneEngine(scene);
  const gpu = await init({ adapter: "auto", label: "embers-lifecycle" });
  const destination = target(gpu, { size: [256, 144], format: "rgba8unorm" });
  try {
    const executor = createSceneExecutor(
      gpu, destination, createRenderPlan("output"), await loadSceneShaders(),
      { kind: "output", table: scene.table, display: DEFAULT_DISPLAY }, engine.getSnapshot(),
    );
    await executor.prewarm();
    await executor.render(0);
    const initial = await destination.read();
    const layer = engine.getSnapshot().scene.layers[0];
    assert.equal(layer.type, "effects");
    const embers = layer.effects[0];
    assert.equal(embers.kind, "embers");

    const restyled = { ...embers, color: { r: 80, g: 180, b: 255 }, opacity: 0.35, particleSize: 0.3 };
    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: embers.id, effect: restyled }).ok, true);
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0);
    assert.notEqual(digest(await destination.read()), digest(initial), "live-only uniforms should update without replacing resources");

    const hidden = { ...restyled, visible: false };
    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: embers.id, effect: hidden }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.3);
    const draining = (await executor.effectEmissionDiagnostics())[0];
    assert.equal(draining.targetRate, 0);
    assert.ok(draining.liveParticles > 0);
    assert.equal(executor.effectResourceCount, 1);

    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: embers.id, effect: restyled }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.6);
    assert.equal(executor.effectResourceCount, 1);
    assert.ok((await executor.effectEmissionDiagnostics())[0].targetRate > 0);

    assert.equal(engine.dispatch({ type: "effect.update", layerId: layer.id, effectId: embers.id, effect: hidden }).ok, true);
    await executor.replaceEffects(engine.getSnapshot());
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(0.9);
    await executor.render(1.2);
    await executor.render(5);
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.hasAnimationDemand(), false);
  } finally {
    engine.dispose();
    gpu.dispose();
  }
});
