import assert from "node:assert/strict";
import test from "node:test";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { compileSceneLayerOperations, createRenderPlan, SCENE_PASS_ORDER } from "../src/renderer/render-plan";

test("render plan has deterministic production pass order", () => {
  assert.deepEqual(createRenderPlan("output").passes, SCENE_PASS_ORDER);
  assert.deepEqual(SCENE_PASS_ORDER, [
    "scene-layers",
    "editor-overlay",
    "present",
  ]);
});

test("scene layer operations preserve intermingled fog composition barriers", () => {
  const base = createSampleSceneDocument();
  const scene = freezeSceneDocument({
    ...base,
    layers: [
      { id: "bottom", name: "Bottom", type: "assets", visible: true, assetIds: [base.assets[0].id] },
      { id: "fog", name: "Fog", type: "fog", visible: true, assetIds: [], fogPolygons: [], fogClearPolygons: [], obstructionPolygons: [], lightSources: [] },
      { id: "weather", name: "Weather", type: "effects", visible: true, effects: [{
        id: "rain", kind: "rain", name: "Rain", visible: true,
        vertices: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }], seed: 7,
        color: { r: 180, g: 210, b: 255 }, opacity: 0.8, density: 4, speed: 5, dropSize: 0.65,
      }] },
      { id: "hidden", name: "Hidden", type: "assets", visible: false, assetIds: [] },
      { id: "top", name: "Top", type: "assets", visible: true, assetIds: [] },
    ],
  });
  assert.deepEqual(compileSceneLayerOperations(scene), [
    { type: "assets", layerId: "bottom", assetIds: [base.assets[0].id] },
    { type: "fog", layerId: "fog" },
    { type: "effects", layerId: "weather", effectIds: ["rain"] },
    { type: "assets", layerId: "top", assetIds: [] },
  ]);
});

test("profiles vary policy without varying the pipeline", () => {
  const editor = createRenderPlan("editor");
  const output = createRenderPlan("output");
  assert.strictEqual(editor.passes, output.passes);
  assert.equal(editor.showEditorGrid, true);
  assert.equal(editor.showGrid, true);
  assert.equal(output.showEditorGrid, false);
  assert.equal(output.showGrid, false);
  assert.ok(editor.fogOpacity < output.fogOpacity);
  assert.equal(output.fogOpacity, 1);
  assert.ok(editor.rainDensityScale < output.rainDensityScale);
  assert.equal(editor.rainMaxDensity, 8);
  assert.equal(output.rainMaxDensity, 8);
  assert.equal(createRenderPlan("editor", { showGrid: false }).showGrid, false);
});
