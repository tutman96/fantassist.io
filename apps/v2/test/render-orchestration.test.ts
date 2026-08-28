import assert from "node:assert/strict";
import test from "node:test";

import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";

import { createRenderPlan, SCENE_PASS_ORDER } from "../src/renderer/render-plan";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { loadSceneShaders } from "../scripts/load-scene-shaders";

test("shared executor submits the complete render plan in one frame", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [64, 36], format: "rgba8unorm" });
    const executor = createSceneExecutor(
      gpu,
      output,
      createRenderPlan("output"),
      await loadSceneShaders()
    );

    await executor.prewarm();
    await executor.render(1.25);

    const instrumentation = getMockGPUDeviceInstrumentation(gpu.gpu);
    assert.equal(instrumentation.calls.createCommandEncoder, 1);
    assert.equal(
      instrumentation.calls.createRenderPipeline +
        instrumentation.calls.createRenderPipelineAsync,
      SCENE_PASS_ORDER.length
    );
  } finally {
    gpu.dispose();
  }
});
