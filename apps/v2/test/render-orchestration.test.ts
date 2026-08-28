import assert from "node:assert/strict";
import test from "node:test";

import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";

import { createRenderPlan, SCENE_PASS_ORDER } from "../src/renderer/render-plan";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { createSceneEngine } from "../src/engine/scene-engine";
import { SAMPLE_ASSET_ID } from "../src/engine/scene-document";
import { DEFAULT_DISPLAY, DEFAULT_TABLE_CAMERA } from "../src/engine/table-camera";
import { loadSceneShaders } from "../scripts/load-scene-shaders";

test("shared executor reuses pipelines across scene snapshot frames", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [64, 36], format: "rgba8unorm" });
    const engine = createSceneEngine();
    const executor = createSceneExecutor(
      gpu,
      output,
      createRenderPlan("output"),
      await loadSceneShaders(),
      { kind: "output", table: DEFAULT_TABLE_CAMERA, display: DEFAULT_DISPLAY },
      engine.getSnapshot()
    );

    await executor.prewarm();
    await executor.render(1.25);
    const transform = engine.getSnapshot().scene.assets[0].transform;
    engine.dispatch({
      type: "asset.transform",
      assetId: SAMPLE_ASSET_ID,
      transform: { ...transform, x: transform.x + 3 },
    });
    executor.setSnapshot(engine.getSnapshot());
    await executor.render(1.25);

    const instrumentation = getMockGPUDeviceInstrumentation(gpu.gpu);
    assert.equal(instrumentation.calls.createCommandEncoder, 2);
    assert.equal(
      instrumentation.calls.createRenderPipeline +
        instrumentation.calls.createRenderPipelineAsync,
      SCENE_PASS_ORDER.length
    );
  } finally {
    gpu.dispose();
  }
});
