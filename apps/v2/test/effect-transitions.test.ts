import assert from "node:assert/strict";
import test from "node:test";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { EFFECT_TRANSITION_DURATION_SECONDS, advanceEffectTransitions, createInitialEffectTransitions, effectTransitionIntensity, hasEffectAnimationDemand, reconcileEffectTransitions } from "../src/renderer/effect-transitions";

const rain = {
  id: "rain",
  kind: "rain" as const,
  name: "Rain",
  visible: true,
  vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
  seed: 4,
  color: { r: 180, g: 210, b: 255 },
  opacity: 0.8,
  density: 8,
  speed: 3,
  dropSize: 0.65,
};

const embers = {
  id: "embers",
  kind: "embers" as const,
  name: "Embers",
  visible: true,
  vertices: rain.vertices,
  seed: 17,
  color: { r: 255, g: 112, b: 38 },
  opacity: 0.8,
  density: 1.6,
  speed: 1.2,
  particleSize: 0.12,
};

const cloud = {
  id: "cloud",
  kind: "cloud" as const,
  name: "Cloud",
  visible: true,
  vertices: rain.vertices,
  seed: 23,
  color: { r: 96, g: 101, b: 110 },
  opacity: 0.64,
  coverage: 0.58,
  speed: 0.18,
  scale: 3,
  turbulence: 0.65,
};

const wallOfFire = {
  id: "wall-of-fire",
  kind: "wall-of-fire" as const,
  name: "Wall of Fire",
  visible: true,
  vertices: [{ x: 0, y: 2 }, { x: 4, y: 2 }],
  seed: 31,
  color: { r: 255, g: 91, b: 24 },
  opacity: 0.9,
  width: 1.2,
  intensity: 0.86,
  speed: 1.3,
  turbulence: 0.7,
};

const effectsLayer = (visible = true) => ({ id: "weather", name: "Weather", type: "effects" as const, visible, effects: [rain] });

test("new effects enter over 240ms smoothstep and keep animation demand", () => {
  const base = createSampleSceneDocument();
  let model = createInitialEffectTransitions(base);
  model = reconcileEffectTransitions(model, freezeSceneDocument({ ...base, layers: [...base.layers, effectsLayer()] }));
  assert.equal(model.entries[0].progress, 0);
  assert.equal(model.entries[0].target, 1);
  assert.equal(hasEffectAnimationDemand(model), true);
  model = advanceEffectTransitions(model, EFFECT_TRANSITION_DURATION_SECONDS / 2);
  assert.equal(model.entries[0].progress, 0.5);
  assert.equal(effectTransitionIntensity(model.entries[0].progress), 0.5);
  model = advanceEffectTransitions(model, EFFECT_TRANSITION_DURATION_SECONDS / 2);
  assert.equal(model.entries[0].progress, 1);
});

test("effect and layer visibility exits reverse smoothly when shown again", () => {
  const base = createSampleSceneDocument();
  const visible = freezeSceneDocument({ ...base, layers: [...base.layers, effectsLayer()] });
  let model = createInitialEffectTransitions(visible);
  const hiddenEffect = freezeSceneDocument({
    ...visible,
    layers: visible.layers.map((layer) => layer.type === "effects" ? { ...layer, effects: [{ ...rain, visible: false }] } : layer),
  });
  model = reconcileEffectTransitions(model, hiddenEffect);
  model = advanceEffectTransitions(model, EFFECT_TRANSITION_DURATION_SECONDS / 2);
  assert.equal(model.entries[0].progress, 0.5);
  model = reconcileEffectTransitions(model, visible);
  assert.equal(model.entries[0].progress, 0.5);
  assert.equal(model.entries[0].target, 1);
  model = advanceEffectTransitions(model, EFFECT_TRANSITION_DURATION_SECONDS / 2);
  assert.equal(model.entries[0].progress, 1);

  model = reconcileEffectTransitions(model, freezeSceneDocument({
    ...visible,
    layers: visible.layers.map((layer) => layer.type === "effects" ? { ...layer, visible: false } : layer),
  }));
  assert.equal(model.entries[0].target, 0);
  assert.equal(hasEffectAnimationDemand(model), true);
});

test("deleted effects retain former layer order until exit retirement", () => {
  const base = createSampleSceneDocument();
  const assets = base.layers.find((layer) => layer.type === "assets")!;
  const fog = base.layers.find((layer) => layer.type === "fog")!;
  const withRain = freezeSceneDocument({ ...base, layers: [assets, effectsLayer(), fog] });
  let model = createInitialEffectTransitions(withRain);
  model = reconcileEffectTransitions(model, freezeSceneDocument({ ...base, layers: [assets, fog] }));
  assert.deepEqual(model.layerOrder, [assets.id, "weather", fog.id]);
  assert.equal(model.entries[0].present, false);
  model = advanceEffectTransitions(model, EFFECT_TRANSITION_DURATION_SECONDS / 2);
  assert.equal(model.entries.length, 1);
  assert.equal(hasEffectAnimationDemand(model), true);
  model = advanceEffectTransitions(model, EFFECT_TRANSITION_DURATION_SECONDS / 2);
  assert.equal(model.entries.length, 0);
  assert.deepEqual(model.layerOrder, [assets.id, fog.id]);
  assert.equal(hasEffectAnimationDemand(model), false);
});

test("an effect deletion retains its exact position inside a surviving layer", () => {
  const base = createSampleSceneDocument();
  const second = { ...rain, id: "rain/two", seed: 9 };
  const third = { ...rain, id: "rain/three", seed: 12 };
  const layer = { ...effectsLayer(), effects: [rain, second, third] };
  const initial = freezeSceneDocument({ ...base, layers: [...base.layers, layer] });
  let model = createInitialEffectTransitions(initial);
  model = reconcileEffectTransitions(model, freezeSceneDocument({
    ...initial,
    layers: initial.layers.map((candidate) => candidate.id === layer.id ? { ...layer, effects: [rain, third] } : candidate),
  }));
  assert.deepEqual(model.effectOrder.get(layer.id), [rain.id, second.id, third.id]);
  assert.equal(model.entries.find((entry) => entry.effect.id === second.id)?.present, false);
});

test("mixed effect kinds preserve one ordered transition lifecycle", () => {
  const base = createSampleSceneDocument();
  const layer = { ...effectsLayer(), effects: [rain, cloud, wallOfFire, embers] };
  const scene = freezeSceneDocument({ ...base, layers: [...base.layers, layer] });
  let model = createInitialEffectTransitions(scene);
  assert.deepEqual(model.entries.map((entry) => entry.effect.kind), ["rain", "cloud", "wall-of-fire", "embers"]);
  model = reconcileEffectTransitions(model, freezeSceneDocument({
    ...scene,
    layers: scene.layers.map((candidate) => candidate.id === layer.id ? { ...layer, effects: [cloud, wallOfFire, embers] } : candidate),
  }));
  assert.deepEqual(model.effectOrder.get(layer.id), [rain.id, cloud.id, wallOfFire.id, embers.id]);
  assert.equal(model.entries.find((entry) => entry.effect.id === rain.id)?.present, false);
  assert.equal(model.entries.find((entry) => entry.effect.id === embers.id)?.target, 1);
  assert.equal(model.entries.find((entry) => entry.effect.id === cloud.id)?.target, 1);
  assert.equal(model.entries.find((entry) => entry.effect.id === wallOfFire.id)?.target, 1);
});
