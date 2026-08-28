import assert from "node:assert/strict";
import test from "node:test";

import { createRenderPlan, SCENE_PASS_ORDER } from "../src/renderer/render-plan";

test("render plan has deterministic production pass order", () => {
  assert.deepEqual(createRenderPlan("output").passes, SCENE_PASS_ORDER);
  assert.deepEqual(SCENE_PASS_ORDER, [
    "asset-background",
    "fog-mask",
    "obstruction-shadows",
    "light-accumulation",
    "composite",
    "present",
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
  assert.equal(createRenderPlan("editor", { showGrid: false }).showGrid, false);
});
