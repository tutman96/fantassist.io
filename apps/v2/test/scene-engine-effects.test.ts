import assert from "node:assert/strict";
import test from "node:test";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import type { CloudEffect, EmbersEffect, RainEffect, SceneDocument, SceneEffect, WallOfFireEffect } from "../src/engine/scene-document";
import { createSceneEngine } from "../src/engine/scene-engine";
import type { SceneCommand } from "../src/engine/scene-engine";

const RAIN: RainEffect = {
  id: "rain/one",
  kind: "rain",
  name: "Rain",
  visible: true,
  vertices: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 4, y: 6 }],
  seed: 42,
  color: { r: 120, g: 180, b: 255 },
  opacity: 0.6,
  density: 1.5,
  speed: 3,
  dropSize: 0.8,
};

const EMBERS: EmbersEffect = {
  id: "embers/one",
  kind: "embers",
  name: "Embers",
  visible: true,
  vertices: [{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 5, y: 8 }],
  seed: 73,
  color: { r: 255, g: 112, b: 38 },
  opacity: 0.8,
  density: 1.6,
  speed: 1.2,
  particleSize: 0.12,
};

const CLOUD: CloudEffect = {
  id: "cloud/one",
  kind: "cloud",
  name: "Smoke",
  visible: true,
  vertices: [{ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 2, y: 8 }],
  seed: 191,
  color: { r: 96, g: 101, b: 110 },
  opacity: 0.64,
  coverage: 0.58,
  speed: 0.18,
  scale: 3,
  turbulence: 0.65,
};

const WALL_OF_FIRE: WallOfFireEffect = {
  id: "wall-of-fire/one",
  kind: "wall-of-fire",
  name: "Wall of Fire",
  visible: true,
  vertices: [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 7 }],
  seed: 313,
  color: { r: 255, g: 91, b: 24 },
  opacity: 0.9,
  width: 1.2,
  intensity: 0.86,
  speed: 1.3,
  turbulence: 0.7,
  sparkDensity: 1.2,
  sparkSize: 0.1,
};

function effectsScene(effects: readonly SceneEffect[] = []): SceneDocument {
  const scene = createSampleSceneDocument();
  return freezeSceneDocument({
    ...scene,
    layers: [
      scene.layers[0],
      { id: "weather", name: "Weather", type: "effects", visible: true, effects },
      scene.layers[1],
    ],
  });
}

function effects(engine: ReturnType<typeof createSceneEngine>): readonly SceneEffect[] {
  const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === "weather");
  assert.ok(layer?.type === "effects");
  return layer.effects;
}

test("rain effects are deeply frozen through document and engine snapshots", () => {
  const scene = effectsScene([RAIN]);
  const layer = scene.layers[1];
  assert.ok(layer.type === "effects");
  assert.equal(Object.isFrozen(layer), true);
  assert.equal(Object.isFrozen(layer.effects), true);
  assert.equal(Object.isFrozen(layer.effects[0]), true);
  assert.equal(Object.isFrozen(layer.effects[0].vertices), true);
  assert.equal(Object.isFrozen(layer.effects[0].vertices[0]), true);
  assert.equal(Object.isFrozen(layer.effects[0].color), true);
  assert.equal(Object.isFrozen(createSceneEngine(scene).getSnapshot()), true);
});

test("effect insert, update, remove, and global history preserve stable IDs and values", () => {
  const engine = createSceneEngine(effectsScene());
  assert.deepEqual(engine.dispatch({ type: "effect.insert", layerId: "weather", effect: RAIN }), {
    ok: true, changed: true, revision: 1,
  });
  assert.deepEqual(engine.getSnapshot().selectedEffect, { layerId: "weather", effectId: RAIN.id });

  const updated = { ...RAIN, name: "Downpour", density: 4, dropSize: 1.2, color: { r: 20, g: 30, b: 40 } };
  assert.deepEqual(engine.dispatch({ type: "effect.update", layerId: "weather", effectId: RAIN.id, effect: updated }), {
    ok: true, changed: true, revision: 2,
  });
  const updatedEffect = effects(engine)[0];
  assert.equal(updatedEffect.kind === "rain" ? updatedEffect.dropSize : undefined, 1.2);
  engine.dispatch({ type: "table.camera", table: { ...engine.getSnapshot().scene.table, scale: 2 } });
  assert.equal(engine.dispatch({ type: "effect.remove", layerId: "weather", effectId: RAIN.id }).ok, true);
  assert.equal(engine.getSnapshot().selectedEffect, null);
  assert.deepEqual(effects(engine), []);

  engine.undo();
  assert.deepEqual(effects(engine), [updated]);
  engine.undo();
  assert.equal(engine.getSnapshot().scene.table.scale, 1);
  engine.undo();
  assert.deepEqual(effects(engine), [RAIN]);
  engine.redo();
  assert.deepEqual(effects(engine), [updated]);
});

test("mixed effect kinds share CRUD, immutable snapshots, and ordered history", () => {
  const engine = createSceneEngine(effectsScene([RAIN]));
  assert.equal(engine.dispatch({ type: "effect.insert", layerId: "weather", effect: EMBERS }).ok, true);
  assert.deepEqual(effects(engine).map((effect) => effect.kind), ["rain", "embers"]);
  const updated = { ...EMBERS, speed: 2.25, particleSize: 0.2 };
  assert.equal(engine.dispatch({ type: "effect.update", layerId: "weather", effectId: EMBERS.id, effect: updated }).ok, true);
  assert.deepEqual(effects(engine)[1], updated);
  assert.equal(Object.isFrozen(effects(engine)[1]), true);
  engine.undo();
  assert.deepEqual(effects(engine)[1], EMBERS);
  engine.undo();
  assert.deepEqual(effects(engine), [RAIN]);
});

test("cloud effects share ordered CRUD and validate procedural parameters", () => {
  const engine = createSceneEngine(effectsScene([RAIN, EMBERS]));
  assert.equal(engine.dispatch({ type: "effect.insert", layerId: "weather", effect: CLOUD }).ok, true);
  assert.deepEqual(effects(engine).map((effect) => effect.kind), ["rain", "embers", "cloud"]);
  const updated = { ...CLOUD, coverage: 0.72, scale: 4.5, turbulence: 0.35 };
  assert.equal(engine.dispatch({ type: "effect.update", layerId: "weather", effectId: CLOUD.id, effect: updated }).ok, true);
  assert.deepEqual(effects(engine)[2], updated);
  engine.undo();
  assert.deepEqual(effects(engine)[2], CLOUD);

  for (const effect of [
    { ...CLOUD, coverage: -0.1 },
    { ...CLOUD, coverage: 1.1 },
    { ...CLOUD, speed: 0 },
    { ...CLOUD, speed: 2.51 },
    { ...CLOUD, scale: 0 },
    { ...CLOUD, scale: 12.1 },
    { ...CLOUD, turbulence: -0.1 },
    { ...CLOUD, turbulence: 1.1 },
  ]) {
    assert.equal(engine.dispatch({ type: "effect.update", layerId: "weather", effectId: CLOUD.id, effect }).ok, false);
  }
});

test("Wall of Fire validates open-path parameters and commits a two-point path", () => {
  const engine = createSceneEngine(effectsScene());
  for (const effect of [
    { ...WALL_OF_FIRE, vertices: [WALL_OF_FIRE.vertices[0]] },
    { ...WALL_OF_FIRE, vertices: [{ x: 1, y: 1 }, { x: 1, y: 1 }] },
    { ...WALL_OF_FIRE, width: 0 },
    { ...WALL_OF_FIRE, intensity: 1.1 },
    { ...WALL_OF_FIRE, speed: 6.1 },
    { ...WALL_OF_FIRE, speed: 0.49 },
    { ...WALL_OF_FIRE, turbulence: -0.1 },
    { ...WALL_OF_FIRE, sparkDensity: 8.1 },
    { ...WALL_OF_FIRE, sparkSize: 0 },
  ]) {
    assert.equal(engine.dispatch({ type: "effect.insert", layerId: "weather", effect }).ok, false);
  }
  const token = engine.beginEffect("weather", { ...WALL_OF_FIRE, vertices: [] }, { x: 1, y: 1 });
  engine.appendEffectVertex(token, { x: 9, y: 1 });
  assert.deepEqual(engine.commitEffect(token), { ok: true, changed: true, revision: 1 });
  assert.deepEqual(effects(engine)[0].vertices, [{ x: 1, y: 1 }, { x: 9, y: 1 }]);
  engine.undo();
  assert.deepEqual(effects(engine), []);
});

test("Wall of Fire selection follows open segments without an implicit closing edge", () => {
  const wideFire = { ...WALL_OF_FIRE, width: 6 };
  const engine = createSceneEngine(effectsScene([wideFire]));
  assert.deepEqual(engine.beginEffectSelectionInteraction({ x: 5, y: 3.8 }, 20), { handled: true });
  assert.deepEqual(engine.getSnapshot().selectedEffect, { layerId: "weather", effectId: WALL_OF_FIRE.id });
  engine.dispatch({ type: "effect.selection.set", selection: null });
  assert.deepEqual(engine.beginEffectSelectionInteraction({ x: 4, y: 6 }, 20), { handled: false });
  assert.equal(engine.getSnapshot().selectedEffect, null);

  engine.dispatch({ type: "effect.selection.set", selection: { layerId: "weather", effectId: WALL_OF_FIRE.id } });
  const interaction = engine.beginEffectSelectionInteraction({ x: 5, y: 1.2 }, 20);
  assert.equal(interaction.handled, true);
  assert.ok(interaction.token);
  engine.updateEffectSelectionInteraction(interaction.token, { x: 7, y: 3.2 });
  assert.deepEqual(effects(engine)[0].vertices, [{ x: 3, y: 3 }, { x: 11, y: 3 }, { x: 11, y: 9 }]);
  assert.equal(engine.commitPreview(interaction.token).ok, true);
  engine.undo();
  assert.deepEqual(effects(engine)[0], wideFire);
});

test("embers validation and generic polygon authoring reject malformed values and commit once", () => {
  const engine = createSceneEngine(effectsScene());
  for (const effect of [
    { ...EMBERS, seed: -1 },
    { ...EMBERS, seed: 0x1_0000_0000 },
    { ...EMBERS, particleSize: 0 },
    { ...EMBERS, particleSize: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(engine.dispatch({ type: "effect.insert", layerId: "weather", effect }).ok, false);
  }
  const token = engine.beginEffect("weather", { ...EMBERS, vertices: [] }, { x: 0, y: 0 });
  engine.appendEffectVertex(token, { x: 4, y: 0 });
  engine.appendEffectVertex(token, { x: 4, y: 4 });
  engine.updateEffectCursor(token, { x: 0, y: 4 });
  assert.deepEqual(engine.commitEffect(token), { ok: true, changed: true, revision: 1 });
  assert.equal(effects(engine)[0].kind, "embers");
  engine.undo();
  assert.deepEqual(effects(engine), []);
});

test("effect commands reject malformed fields, duplicate IDs, changed IDs, and wrong layers", () => {
  const engine = createSceneEngine(effectsScene([RAIN]));
  const malformed = [
    { ...RAIN, id: "" },
    { ...RAIN, name: " " },
    { ...RAIN, visible: 1 },
    { ...RAIN, vertices: RAIN.vertices.slice(0, 2) },
    { ...RAIN, vertices: [{ x: Number.NaN, y: 0 }, ...RAIN.vertices.slice(1)] },
    { ...RAIN, seed: 1.2 },
    { ...RAIN, color: { r: -1, g: 0, b: 0 } },
    { ...RAIN, opacity: 1.1 },
    { ...RAIN, density: -1 },
    { ...RAIN, speed: 0 },
    { ...RAIN, speed: Infinity },
    { ...RAIN, dropSize: 0 },
    { ...RAIN, dropSize: Infinity },
  ];
  for (const effect of malformed) {
    const command = { type: "effect.insert", layerId: "weather", effect } as SceneCommand;
    assert.equal(engine.dispatch(command).ok, false);
  }
  assert.equal(engine.dispatch({ type: "effect.insert", layerId: "weather", effect: RAIN }).ok, false);
  assert.equal(engine.dispatch({ type: "effect.insert", layerId: "sample/assets", effect: { ...RAIN, id: "other" } }).ok, false);
  assert.equal(engine.dispatch({ type: "effect.update", layerId: "weather", effectId: RAIN.id, effect: { ...RAIN, id: "changed" } }).ok, false);
  assert.equal(engine.getSnapshot().revision, 0);
});

test("rain insert and update previews are replaceable editor-only revisions", () => {
  const engine = createSceneEngine(effectsScene());
  const token = engine.beginPreview({ type: "effect.insert", layerId: "weather", effect: RAIN });
  assert.deepEqual(effects(engine), [RAIN]);
  assert.deepEqual(effects(createSceneEngine(engine.getCommittedSnapshot().scene)), []);
  assert.equal(engine.getSnapshot().revision, 0);
  assert.equal(engine.getSnapshot().invalidation, "editor");
  engine.updatePreview(token, { type: "effect.insert", layerId: "weather", effect: { ...RAIN, opacity: 0.25 } });
  assert.equal(effects(engine)[0].opacity, 0.25);
  engine.cancelPreview(token);
  assert.deepEqual(effects(engine), []);
  assert.equal(engine.getSnapshot().revision, 0);

  engine.dispatch({ type: "effect.insert", layerId: "weather", effect: RAIN });
  const update = engine.beginPreview({ type: "effect.update", layerId: "weather", effectId: RAIN.id, effect: RAIN });
  engine.updatePreview(update, { type: "effect.update", layerId: "weather", effectId: RAIN.id, effect: { ...RAIN, speed: 9 } });
  assert.equal(effects(engine)[0].speed, 9);
  assert.equal(engine.getCommittedSnapshot().scene.layers[1].type, "effects");
  assert.deepEqual(engine.commitPreview(update), { ok: true, changed: true, revision: 2 });
});

test("rain drawing previews cursor geometry, snaps, commits once, selects by ID, and undoes", () => {
  const base = effectsScene();
  const engine = createSceneEngine(freezeSceneDocument({ ...base, table: { ...base.table, displayGrid: true } }));
  const draft = { ...RAIN, vertices: [] };
  engine.setEffectCursor({ x: 0.94, y: 1.04 });
  assert.deepEqual(engine.getSnapshot().effectCursorPoint, { x: 1, y: 1 });
  assert.deepEqual(engine.getSnapshot().gridSnapPoint, { x: 1, y: 1 });
  assert.equal(engine.getSnapshot().revision, 0);
  const token = engine.beginEffect("weather", draft, { x: 0.94, y: 1.04 });
  assert.equal(engine.getSnapshot().effectDrawingActive, true);
  assert.deepEqual(engine.getSnapshot().effectCursorPoint, { x: 1, y: 1 });
  assert.deepEqual(engine.getSnapshot().gridSnapPoint, { x: 1, y: 1 });
  assert.deepEqual(effects(engine)[0].vertices.slice(0, 1), [{ x: 1, y: 1 }]);
  engine.appendEffectVertex(token, { x: 5.04, y: 1.02 });
  engine.appendEffectVertex(token, { x: 4.97, y: 6.04 });
  engine.updateEffectCursor(token, { x: 0.96, y: 5.98 });
  assert.deepEqual(effects(engine)[0].vertices, [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 6 }, { x: 1, y: 6 }]);
  assert.equal(engine.getSnapshot().revision, 0);
  assert.deepEqual(engine.commitActiveEffect(), { ok: true, changed: true, revision: 1 });
  assert.equal(engine.getSnapshot().effectDrawingActive, false);
  assert.equal(engine.getSnapshot().effectCursorPoint, null);
  assert.deepEqual(engine.getSnapshot().selectedEffect, { layerId: "weather", effectId: RAIN.id });
  assert.deepEqual(engine.commitActiveEffect(), { ok: false, error: "No active effect", revision: 1 });
  engine.undo();
  assert.deepEqual(effects(engine), []);
});

test("rain drawing enforces three fixed vertices and supports cancellation", () => {
  const engine = createSceneEngine(effectsScene());
  const token = engine.beginEffect("weather", { ...RAIN, vertices: [] }, { x: 0, y: 0 });
  engine.appendEffectVertex(token, { x: 2, y: 0 });
  assert.deepEqual(engine.commitEffect(token), {
    ok: false, error: "Effects require at least three vertices", revision: 0,
  });
  assert.equal(engine.getSnapshot().previewActive, true);
  engine.cancelPreview(token);
  assert.equal(engine.getSnapshot().previewActive, false);
  assert.deepEqual(effects(engine), []);
});

test("effects layers retain ordering and lifecycle history without asset assumptions", () => {
  const engine = createSceneEngine(createSampleSceneDocument());
  const layer = { id: "weather", name: "Weather", type: "effects" as const, visible: true, effects: [] };
  engine.dispatch({ type: "layer.insert", layer, index: 1 });
  assert.deepEqual(engine.getSnapshot().scene.layers.map((item) => item.id), ["sample/assets", "weather", "sample/fog"]);
  engine.dispatch({ type: "effect.insert", layerId: layer.id, effect: RAIN });
  engine.dispatch({ type: "effect.selection.set", selection: { layerId: layer.id, effectId: RAIN.id } });
  engine.dispatch({ type: "layer.move", layerId: layer.id, toIndex: 0 });
  assert.equal(engine.getSnapshot().scene.layers[0].id, layer.id);
  assert.equal(engine.dispatch({ type: "layer.remove", layerId: layer.id }).ok, true);
  assert.equal(engine.getSnapshot().selectedEffect, null);
  engine.undo();
  assert.equal(engine.getSnapshot().scene.layers[0].id, layer.id);
  const restored = engine.getSnapshot().scene.layers[0];
  assert.ok(restored.type === "effects");
  assert.deepEqual(restored.effects, [RAIN]);
  engine.redo();
  assert.equal(engine.getSnapshot().scene.layers.some((item) => item.id === layer.id), false);
});

test("effect selection is editor-only and follows IDs rather than array positions", () => {
  const second = { ...RAIN, id: "rain/two", name: "Second" };
  const engine = createSceneEngine(effectsScene([RAIN, second]));
  assert.deepEqual(engine.dispatch({ type: "effect.selection.set", selection: { layerId: "weather", effectId: second.id } }), {
    ok: true, changed: true, revision: 0,
  });
  assert.equal(engine.getSnapshot().invalidation, "editor");
  engine.dispatch({ type: "effect.remove", layerId: "weather", effectId: RAIN.id });
  assert.deepEqual(engine.getSnapshot().selectedEffect, { layerId: "weather", effectId: second.id });
  assert.equal(engine.dispatch({ type: "effect.selection.set", selection: { layerId: "weather", effectId: "missing" } }).ok, false);
  engine.dispatch({ type: "effect.remove", layerId: "weather", effectId: second.id });
  assert.equal(engine.getSnapshot().selectedEffect, null);
});

test("rain edges select by stable ID and an empty miss clears selection", () => {
  const engine = createSceneEngine(effectsScene([RAIN]));
  assert.deepEqual(engine.beginEffectSelectionInteraction({ x: 4, y: 0 }, 20), { handled: true });
  assert.deepEqual(engine.getSnapshot().selectedEffect, { layerId: "weather", effectId: RAIN.id });
  assert.equal(engine.getSnapshot().revision, 0);
  assert.equal(engine.getSnapshot().invalidation, "editor");
  assert.deepEqual(engine.beginEffectSelectionInteraction({ x: 100, y: 100 }, 20), { handled: false });
  assert.equal(engine.getSnapshot().selectedEffect, null);
});

test("rain edge picking honors topmost effect and layer order and skips hidden geometry", () => {
  const lower = { ...RAIN, id: "rain/lower", name: "Lower" };
  const upper = { ...RAIN, id: "rain/upper", name: "Upper" };
  const scene = effectsScene([lower, upper]);
  let engine = createSceneEngine(scene);
  engine.beginEffectSelectionInteraction({ x: 4, y: 0 }, 20);
  assert.equal(engine.getSnapshot().selectedEffect?.effectId, upper.id);

  engine = createSceneEngine(effectsScene([lower, { ...upper, visible: false }]));
  engine.beginEffectSelectionInteraction({ x: 4, y: 0 }, 20);
  assert.equal(engine.getSnapshot().selectedEffect?.effectId, lower.id);

  const topRain = { ...upper, id: "rain/top", visible: true };
  const topLayer = { id: "weather/top", name: "Top Weather", type: "effects" as const, visible: true, effects: [topRain] };
  engine = createSceneEngine(freezeSceneDocument({ ...scene, layers: [...scene.layers, topLayer] }));
  engine.beginEffectSelectionInteraction({ x: 4, y: 0 }, 20);
  assert.deepEqual(engine.getSnapshot().selectedEffect, { layerId: topLayer.id, effectId: topRain.id });

  engine = createSceneEngine(freezeSceneDocument({
    ...scene,
    layers: scene.layers.map((layer) => layer.type === "effects" ? { ...layer, visible: false } : layer),
  }));
  assert.deepEqual(engine.beginEffectSelectionInteraction({ x: 4, y: 0 }, 20), { handled: false });
  assert.equal(engine.getSnapshot().selectedEffect, null);
});

test("selected rain vertex drag snaps, previews immutably, cancels exactly, and commits one history entry", () => {
  const base = effectsScene([RAIN]);
  const engine = createSceneEngine(freezeSceneDocument({ ...base, table: { ...base.table, displayGrid: true } }));
  engine.dispatch({ type: "effect.selection.set", selection: { layerId: "weather", effectId: RAIN.id } });
  const before = effects(engine)[0];
  const canceled = engine.beginEffectSelectionInteraction(before.vertices[0], 20);
  assert.equal(canceled.handled, true);
  assert.ok(canceled.token);
  engine.updateEffectSelectionInteraction(canceled.token, { x: -2.04, y: 3.02 });
  assert.deepEqual(effects(engine)[0].vertices[0], { x: -2, y: 3 });
  assert.deepEqual(engine.getSnapshot().effectCursorPoint, { x: -2, y: 3 });
  assert.deepEqual(engine.getSnapshot().gridSnapPoint, { x: -2, y: 3 });
  assert.equal(engine.getSnapshot().revision, 0);
  assert.equal(Object.isFrozen(effects(engine)[0].vertices), true);
  assert.equal(Object.isFrozen(effects(engine)[0].vertices[0]), true);
  engine.cancelPreview(canceled.token);
  assert.deepEqual(effects(engine)[0], before);
  assert.equal(engine.getSnapshot().effectCursorPoint, null);

  const committed = engine.beginEffectSelectionInteraction(before.vertices[0], 20);
  assert.ok(committed.token);
  engine.updateEffectSelectionInteraction(committed.token, { x: -2.04, y: 3.02 });
  assert.deepEqual(engine.commitPreview(committed.token), { ok: true, changed: true, revision: 1 });
  assert.deepEqual(engine.undo(), { ok: true, changed: true, revision: 2 });
  assert.deepEqual(effects(engine)[0], before);
  assert.equal(engine.getSnapshot().canUndo, false);
  assert.deepEqual(engine.redo(), { ok: true, changed: true, revision: 3 });
  assert.deepEqual(effects(engine)[0].vertices[0], { x: -2, y: 3 });
});

test("dragging inside selected rain translates without distortion and snaps its nearest vertex", () => {
  const vertices = [{ x: 0.22, y: 0.2 }, { x: 2.04, y: 1.97 }, { x: 4.3, y: 0.4 }];
  const rain = { ...RAIN, vertices };
  const base = effectsScene([rain]);
  const engine = createSceneEngine(freezeSceneDocument({ ...base, table: { ...base.table, displayGrid: true } }));
  engine.dispatch({ type: "effect.selection.set", selection: { layerId: "weather", effectId: rain.id } });
  const interaction = engine.beginEffectSelectionInteraction({ x: 2, y: 1 }, 20);
  assert.equal(interaction.handled, true);
  assert.ok(interaction.token);
  engine.updateEffectSelectionInteraction(interaction.token, { x: 2, y: 1 });
  assert.deepEqual(engine.getSnapshot().gridSnapPoint, { x: 2, y: 2 });
  assert.deepEqual(effects(engine)[0].vertices, [
    { x: 0.18, y: 0.23 },
    { x: 2, y: 2 },
    { x: 4.26, y: 0.43 },
  ]);
  effects(engine)[0].vertices.forEach((vertex, index) => {
    assert.ok(Math.abs((vertex.x - effects(engine)[0].vertices[0].x) - (vertices[index].x - vertices[0].x)) < 1e-12);
    assert.ok(Math.abs((vertex.y - effects(engine)[0].vertices[0].y) - (vertices[index].y - vertices[0].y)) < 1e-12);
  });
  assert.equal(engine.getSnapshot().revision, 0);
  assert.deepEqual(engine.commitPreview(interaction.token), { ok: true, changed: true, revision: 1 });
  engine.undo();
  assert.deepEqual(effects(engine)[0].vertices, vertices);
  engine.redo();
  assert.deepEqual(effects(engine)[0].vertices[1], { x: 2, y: 2 });
});
