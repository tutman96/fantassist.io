import assert from "node:assert/strict";
import test from "node:test";

import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";

import { createRenderPlan, SCENE_PASS_ORDER } from "../src/renderer/render-plan";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { createSceneEngine } from "../src/engine/scene-engine";
import { SAMPLE_ASSET_ID, createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { DEFAULT_DISPLAY, DEFAULT_TABLE_CAMERA } from "../src/engine/table-camera";
import { loadSceneShaders } from "../scripts/load-scene-shaders";

test("shared executor reuses pipelines across scene snapshot frames", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [64, 36], format: "rgba8unorm" });
    const base = createSampleSceneDocument();
    const secondAsset = {
      ...base.assets[0],
      id: "sample/second-image",
      mediaId: "sample/second-image",
      name: "Second image",
      transform: { ...base.assets[0].transform, x: 8, y: 6, width: 12, height: 8 },
    };
    const engine = createSceneEngine(freezeSceneDocument({
      ...base,
      layers: base.layers.map((layer) => layer.type === "assets"
        ? { ...layer, assetIds: [...layer.assetIds, secondAsset.id] }
        : layer),
      assets: [...base.assets, secondAsset],
    }));
    let imageUploads = 0;
    const executor = createSceneExecutor(
      gpu,
      output,
      createRenderPlan("output"),
      await loadSceneShaders(),
      { kind: "output", table: DEFAULT_TABLE_CAMERA, display: DEFAULT_DISPLAY },
      engine.getSnapshot(),
      [0, 1].map(() => ({
        width: 2,
        height: 2,
        upload(uploadGpu, texture) {
          imageUploads++;
          uploadGpu.gpu.queue.writeTexture(
            { texture: texture.gpu },
            new Uint8Array([
              255, 0, 0, 255, 0, 255, 0, 255,
              0, 0, 255, 255, 255, 255, 255, 0,
            ]),
            { bytesPerRow: 8, rowsPerImage: 2 },
            [2, 2, 1]
          );
        },
        dispose() {},
      }))
    );
    assert.equal(imageUploads, 2);

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
