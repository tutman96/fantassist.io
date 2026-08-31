import assert from "node:assert/strict";
import test from "node:test";

import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import type { Gpu, Texture } from "vgpu";

import { createRenderPlan } from "../src/renderer/render-plan";
import { effectGeometryKey } from "../src/renderer/effect-resource-key";
import { createCosmicExecutor } from "../src/renderer/vgpu/cosmic-executor";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { createSceneEngine } from "../src/engine/scene-engine";
import { SAMPLE_ASSET_ID, createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { DEFAULT_DISPLAY, DEFAULT_TABLE_CAMERA } from "../src/engine/table-camera";
import { loadSceneShaders } from "../scripts/load-scene-shaders";

const cosmicTestShader = `
struct Params { target_size: vec2f, time: f32, intensity: f32 }
@group(0) @binding(0) var<uniform> params: Params;
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(uv, fract(params.time) * params.intensity, 1.0);
}`;

test("browser effect resource key includes scene identity for identical and empty effects", () => {
  const base = createSampleSceneDocument();
  const rainLayer = {
    id: "weather", name: "Weather", type: "effects" as const, visible: true, effects: [{
      id: "rain", kind: "rain" as const, name: "Rain", visible: true,
      vertices: [{ x: 1, y: 1 }, { x: 20, y: 1 }, { x: 20, y: 14 }, { x: 1, y: 14 }],
      seed: 2, color: { r: 180, g: 210, b: 255 }, opacity: 0.8,
      density: 8, speed: 10, dropSize: 0.65,
    }],
  };
  const key = (id: string, layers = base.layers) => effectGeometryKey(createSceneEngine(freezeSceneDocument({
    ...base,
    id,
    layers,
  })).getSnapshot());
  assert.notEqual(key("scene/a"), key("scene/b"));
  assert.notEqual(key("scene/a", [...base.layers, rainLayer]), key("scene/b", [...base.layers, rainLayer]));
});

test("cosmic background reuses one decorative pipeline across frames", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [48, 32], format: "rgba8unorm" });
    const executor = createCosmicExecutor(gpu, output, cosmicTestShader);
    await executor.prewarm();
    await executor.render(0);
    await executor.render(1.5);
    const instrumentation = getMockGPUDeviceInstrumentation(gpu.gpu);
    assert.equal(instrumentation.calls.createCommandEncoder, 2);
    assert.equal(
      instrumentation.calls.createRenderPipeline + instrumentation.calls.createRenderPipelineAsync,
      1
    );
  } finally {
    gpu.dispose();
  }
});

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
      layers: base.layers.map((layer) => {
        if (layer.type === "assets") return { ...layer, assetIds: [...layer.assetIds, secondAsset.id] };
        if (layer.type !== "fog") return layer;
        return {
          ...layer,
          obstructionPolygons: [{ vertices: [{ x: 12, y: 2 }, { x: 12, y: 20 }], visibleOnTable: true }],
          lightSources: [{
            position: { x: 8, y: 10 },
            brightLightDistance: 3,
            dimLightDistance: 10,
            color: { r: 255, g: 180, b: 80, a: 255 },
          }],
        };
      }).concat([{
        id: "weather",
        name: "Weather",
        type: "effects" as const,
        visible: true,
        effects: [{
          id: "rain", kind: "rain" as const, name: "Rain", visible: true,
          vertices: [{ x: 1, y: 1 }, { x: 20, y: 1 }, { x: 20, y: 15 }, { x: 1, y: 15 }],
          seed: 3, color: { r: 190, g: 220, b: 255 }, opacity: 0.7,
          density: 8, speed: 4, dropSize: 0.65,
        }],
      }]),
      assets: [...base.assets, secondAsset],
    }));
    let imageUploads = 0;
    const uploads = (count: number) => Array.from({ length: count }, () => ({
      width: 2,
      height: 2,
      upload(uploadGpu: Gpu, texture: Texture) {
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
    }));
    const executor = createSceneExecutor(
      gpu,
      output,
      createRenderPlan("output"),
      await loadSceneShaders(),
      { kind: "output", table: DEFAULT_TABLE_CAMERA, display: DEFAULT_DISPLAY },
      engine.getSnapshot(),
      uploads(2)
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
    engine.dispatch({ type: "asset.remove", assetId: secondAsset.id });
    await executor.replaceAssets(engine.getSnapshot(), uploads(1));
    await executor.render(1.25);
    assert.equal(imageUploads, 3);

    const instrumentation = getMockGPUDeviceInstrumentation(gpu.gpu);
    assert.ok(instrumentation.calls.createCommandEncoder >= 3);
    assert.equal(
      instrumentation.calls.createRenderPipeline +
        instrumentation.calls.createRenderPipelineAsync,
      11
    );
  } finally {
    gpu.dispose();
  }
});

test("executor retains deleted rain resources through exit and retires them afterward", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [48, 32], format: "rgba8unorm" });
    const base = createSampleSceneDocument();
    const withRain = freezeSceneDocument({ ...base, layers: [...base.layers, {
      id: "weather", name: "Weather", type: "effects", visible: true, effects: [{
        id: "rain", kind: "rain", name: "Rain", visible: true,
        vertices: [{ x: 1, y: 1 }, { x: 20, y: 1 }, { x: 20, y: 14 }, { x: 1, y: 14 }],
        seed: 2, color: { r: 180, g: 210, b: 255 }, opacity: 0.8,
        density: 8, speed: 10, dropSize: 0.65,
      }],
    }] });
    const withRainSnapshot = createSceneEngine(withRain).getSnapshot();
    const executor = createSceneExecutor(
      gpu, output, createRenderPlan("editor"), await loadSceneShaders(),
      {
        kind: "editor", table: DEFAULT_TABLE_CAMERA, display: DEFAULT_DISPLAY,
        camera: { centerGrid: { x: 22, y: 12.5 }, cssPixelsPerGrid: 1 }, viewportCss: { width: 48, height: 32 },
      }, withRainSnapshot,
    );
    await executor.prewarm();
    await executor.render(0);
    assert.equal(executor.effectResourceCount, 1);
    assert.equal(executor.effectGeometryResourceCount, 2);

    const hiddenRain = freezeSceneDocument({
      ...withRain,
      layers: withRain.layers.map((layer) => layer.type === "effects" ? { ...layer, visible: false } : layer),
    });
    const hiddenRainSnapshot = createSceneEngine(hiddenRain).getSnapshot();
    await executor.replaceEffects(hiddenRainSnapshot);
    executor.setSnapshot(hiddenRainSnapshot);
    await executor.render(0.12);
    assert.equal(executor.effectResourceCount, 1);
    await executor.render(0.24);
    assert.equal(executor.effectResourceCount, 1);
    assert.equal(executor.hasAnimationDemand(), true);

    await executor.replaceEffects(withRainSnapshot);
    executor.setSnapshot(withRainSnapshot);
    assert.equal(executor.effectResourceCount, 1);
    assert.equal(executor.effectGeometryResourceCount, 2);
    assert.equal(executor.hasAnimationDemand(), true);
    await executor.render(0.36);

    const withoutRainSnapshot = createSceneEngine(base).getSnapshot();
    await executor.replaceEffects(withoutRainSnapshot);
    executor.setSnapshot(withoutRainSnapshot);
    assert.equal(executor.effectResourceCount, 1);
    assert.equal(executor.hasAnimationDemand(), true);
    await executor.render(0.48);
    assert.equal(executor.effectResourceCount, 1);
    await executor.render(0.6);
    assert.equal(executor.effectResourceCount, 1);
    await executor.render(3.5);
    assert.equal(executor.effectResourceCount, 1);
    await executor.render(5);
    assert.equal(executor.effectResourceCount, 0);
    assert.equal(executor.effectGeometryResourceCount, 0);
    assert.equal(executor.hasAnimationDemand(), false);
  } finally {
    gpu.dispose();
  }
});

test("editor rain prewarms guide and handle geometry while output omits them", async () => {
  const base = createSampleSceneDocument();
  const scene = freezeSceneDocument({ ...base, layers: [{
    id: "weather", name: "Weather", type: "effects", visible: true, effects: [{
      id: "rain", kind: "rain", name: "Rain", visible: true,
      vertices: [{ x: 2, y: 2 }, { x: 20, y: 2 }, { x: 20, y: 14 }, { x: 2, y: 14 }],
      seed: 5, color: { r: 180, g: 210, b: 255 }, opacity: 0.8,
      density: 8, speed: 3, dropSize: 0.65,
    }],
  }], assets: [] });
  const snapshot = createSceneEngine(scene).getSnapshot();
  const shaders = await loadSceneShaders();
  const outputGpu = await init();
  const editorGpu = await init();
  try {
    const outputExecutor = createSceneExecutor(
      outputGpu, target(outputGpu, { size: [48, 32], format: "rgba8unorm" }), createRenderPlan("output"), shaders,
      { kind: "output", table: DEFAULT_TABLE_CAMERA, display: DEFAULT_DISPLAY }, snapshot,
    );
    const editorExecutor = createSceneExecutor(
      editorGpu, target(editorGpu, { size: [48, 32], format: "rgba8unorm" }), createRenderPlan("editor"), shaders,
      {
        kind: "editor", table: DEFAULT_TABLE_CAMERA, display: DEFAULT_DISPLAY,
        camera: { centerGrid: { x: 22, y: 12.5 }, cssPixelsPerGrid: 1 }, viewportCss: { width: 48, height: 32 },
      }, snapshot,
    );
    assert.equal(outputExecutor.effectGeometryResourceCount, 0);
    assert.equal(editorExecutor.effectGeometryResourceCount, 2);
    await outputExecutor.prewarm();
    await editorExecutor.prewarm();
    const outputPipelines = getMockGPUDeviceInstrumentation(outputGpu.gpu).calls.createRenderPipelineAsync
      + getMockGPUDeviceInstrumentation(outputGpu.gpu).calls.createRenderPipeline;
    const editorPipelines = getMockGPUDeviceInstrumentation(editorGpu.gpu).calls.createRenderPipelineAsync
      + getMockGPUDeviceInstrumentation(editorGpu.gpu).calls.createRenderPipeline;
    assert.equal(editorPipelines, outputPipelines + 2);
  } finally {
    outputGpu.dispose();
    editorGpu.dispose();
  }
});
