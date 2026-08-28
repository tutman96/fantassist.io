import { draw, effect, frame, sampler, target } from "vgpu";
import type { Draw, Effect, Gpu, Target, TargetSignature } from "vgpu";

import type { SceneEngineSnapshot } from "../../engine/scene-engine";
import { createFallbackImageUpload } from "../image-texture";
import type { ImageTextureUpload } from "../image-texture";
import type { RenderPlan, ScenePass } from "../render-plan";
import { compileProjection, projectionUniforms } from "../projection";
import type { RenderView } from "../projection";
import type { SceneShaders } from "./scene-shaders";

export interface SceneExecutor {
  readonly lightFormat: "rgba16float";
  readonly estimatedTargetBytes: number;
  prewarm(): Promise<void>;
  render(time: number): Promise<void>;
  resize(size: readonly [number, number]): void;
  setGridVisible(visible: boolean): void;
  setSnapshot(snapshot: SceneEngineSnapshot): void;
  setView(view: RenderView): void;
}

export function createSceneExecutor(
  gpu: Gpu,
  destination: Target,
  plan: RenderPlan,
  shaders: SceneShaders,
  initialView: RenderView,
  initialSnapshot: SceneEngineSnapshot,
  imageUpload: ImageTextureUpload = createFallbackImageUpload()
): SceneExecutor {
  const size = destination.size;
  const scene = target(gpu, { size, format: "rgba8unorm", label: "scene-assets" });
  const fog = target(gpu, { size, format: "rgba8unorm", label: "fog-mask" });
  const shadows = target(gpu, { size, format: "rgba8unorm", label: "obstruction-shadows" });
  const lights = target(gpu, { size, format: "rgba16float", label: "light-accumulation" });
  const compositeTarget = target(gpu, { size, format: "rgba16float", label: "linear-composite" });
  const linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  const imageSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  const mapTexture = gpu.device.createTexture({
    size: [imageUpload.width, imageUpload.height],
    format: "rgba8unorm-srgb",
    usage: ["copy_dst", "texture_binding", "render_attachment"],
    label: "scene-image-texture",
  });
  let gridVisible = plan.showGrid;
  let view = initialView;
  let snapshot = initialSnapshot;
  let renderSize = { width: size[0], height: size[1] };
  let projection = compileProjection(view, renderSize);
  const spatialParams = (time = 0) => ({ ...projectionUniforms(projection), time });
  const assetParams = (time = 0) => {
    const asset = snapshot.scene.assets[0];
    return {
      ...spatialParams(time),
      asset_origin: [asset.transform.x, asset.transform.y],
      asset_size: [asset.transform.width, asset.transform.height],
      asset_rotation: (asset.transform.rotation * Math.PI) / 180,
    };
  };
  const selectionParams = () => {
    const asset = snapshot.scene.assets[0];
    return {
      asset_origin: [asset.transform.x, asset.transform.y],
      asset_size: [asset.transform.width, asset.transform.height],
      asset_rotation: (asset.transform.rotation * Math.PI) / 180,
      selected: plan.showEditorGrid && snapshot.selectedAssetId === asset.id ? 1 : 0,
    };
  };
  imageUpload.upload(gpu, mapTexture);

  const assets = draw(gpu, {
    shader: shaders.assets,
    vertices: 6,
    instances: 1,
    blend: "premultiplied",
    label: "asset-background",
    set: {
      map_texture: mapTexture,
      texture_sampler: imageSampler,
      params: assetParams(),
    },
  });
  const fogMask = effect(gpu, shaders.fogMask, {
    label: "fog-mask",
    set: { params: projectionUniforms(projection) },
  });
  const obstructionShadows = effect(gpu, shaders.obstructionShadows, {
    label: "obstruction-shadows",
    set: { params: spatialParams() },
  });
  const lightAccumulation = effect(gpu, shaders.lightAccumulation, {
    label: "light-accumulation",
    set: { shadows, texture_sampler: linearSampler, params: spatialParams() },
  });
  const composite = effect(gpu, shaders.composite, {
    label: "composite",
    set: {
      scene,
      fog_mask: fog,
      light: lights,
      shadow_map: shadows,
      texture_sampler: linearSampler,
      params: {
        ...spatialParams(),
        fog_opacity: plan.fogOpacity,
        show_fog_edges: plan.showEditorGrid ? 1 : 0,
        show_grid: gridVisible ? 1 : 0,
        show_walls: plan.showEditorGrid ? 1 : 0,
        show_lights: plan.showEditorGrid ? 1 : 0,
        ...selectionParams(),
        time: 0,
      },
    },
  });
  const present = effect(gpu, shaders.present, {
    label: "linear-to-display-present",
    set: { linear_scene: compositeTarget, texture_sampler: linearSampler },
  });
  const passes: Record<
    ScenePass,
    { drawable: Draw | Effect; output: Target; clear: readonly [number, number, number, number] }
  > = {
    "asset-background": { drawable: assets, output: scene, clear: [0, 0, 0, 1] },
    "fog-mask": { drawable: fogMask, output: fog, clear: [1, 1, 1, 1] },
    "obstruction-shadows": {
      drawable: obstructionShadows,
      output: shadows,
      clear: [1, 1, 0, 1],
    },
    "light-accumulation": { drawable: lightAccumulation, output: lights, clear: [0, 0, 0, 1] },
    composite: { drawable: composite, output: compositeTarget, clear: [0, 0, 0, 1] },
    present: { drawable: present, output: destination, clear: [0, 0, 0, 1] },
  };
  const signature = (output: Target): TargetSignature => ({
    colors: output.colors.map((color) => color.format),
    depth: output.depth?.format,
    sampleCount: output.sampleCount,
  });

  return {
    lightFormat: "rgba16float",
    get estimatedTargetBytes() {
      const [width, height] = destination.size;
      return width * height * (4 + 4 + 4 + 8 + 8 + 4);
    },
    async prewarm() {
      await Promise.all(
        plan.passes.map((name) => {
          const pass = passes[name];
          return pass.drawable.compile(signature(pass.output));
        })
      );
      await gpu.settled();
    },
    async render(time) {
      const params = spatialParams(time);
      assets.set({ params: assetParams(time) });
      fogMask.set({ params: projectionUniforms(projection) });
      obstructionShadows.set({ params });
      lightAccumulation.set({ params });
      composite.set({
        params: {
          ...params,
          fog_opacity: plan.fogOpacity,
          show_fog_edges: plan.showEditorGrid ? 1 : 0,
          show_grid: gridVisible ? 1 : 0,
          show_walls: plan.showEditorGrid ? 1 : 0,
          show_lights: plan.showEditorGrid ? 1 : 0,
          ...selectionParams(),
          time,
        },
      });
      const submitted = frame(gpu, (currentFrame) => {
        for (const name of plan.passes) {
          const pass = passes[name];
          currentFrame.pass({ target: pass.output, clear: pass.clear }, pass.drawable);
        }
      });
      await submitted.done;
      await gpu.settled();
    },
    resize(nextSize) {
      renderSize = { width: nextSize[0], height: nextSize[1] };
      projection = compileProjection(view, renderSize);
      scene.resize(nextSize);
      fog.resize(nextSize);
      shadows.resize(nextSize);
      lights.resize(nextSize);
      compositeTarget.resize(nextSize);
    },
    setGridVisible(visible) {
      gridVisible = visible;
    },
    setSnapshot(nextSnapshot) {
      snapshot = nextSnapshot;
    },
    setView(nextView) {
      view = nextView;
      projection = compileProjection(view, renderSize);
    },
  };
}
