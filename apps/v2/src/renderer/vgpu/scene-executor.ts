import { draw, effect, frame, sampler, target } from "vgpu";
import type { Draw, Effect, Gpu, Target, TargetSignature, Texture } from "vgpu";

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
  replaceAssets(snapshot: SceneEngineSnapshot, uploads: readonly ImageTextureUpload[]): Promise<void>;
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
  imageUploads: readonly ImageTextureUpload[] = initialSnapshot.scene.assets.map(() => createFallbackImageUpload())
): SceneExecutor {
  const size = destination.size;
  const scene = target(gpu, { size, format: "rgba8unorm", label: "scene-assets" });
  const fog = target(gpu, { size, format: "rgba8unorm", label: "fog-mask" });
  const shadows = target(gpu, { size, format: "rgba8unorm", label: "obstruction-shadows" });
  const lights = target(gpu, { size, format: "rgba16float", label: "light-accumulation" });
  const compositeTarget = target(gpu, { size, format: "rgba16float", label: "linear-composite" });
  const linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  const imageSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  let gridVisible = plan.showGrid;
  let view = initialView;
  let snapshot = initialSnapshot;
  let renderSize = { width: size[0], height: size[1] };
  let projection = compileProjection(view, renderSize);
  const spatialParams = (time = 0) => ({ ...projectionUniforms(projection), time });
  const assetParams = (asset: SceneEngineSnapshot["scene"]["assets"][number], time = 0) => ({
      ...spatialParams(time),
      asset_origin: [asset.transform.x, asset.transform.y],
      asset_size: [asset.transform.width, asset.transform.height],
      asset_rotation: (asset.transform.rotation * Math.PI) / 180,
    });
  const selectionParams = () => {
    const asset = snapshot.scene.assets.find((candidate) => candidate.id === snapshot.selectedAssetId)
      ?? snapshot.scene.assets[0];
    const transform = asset?.transform ?? { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
    const layerVisible = asset
      ? snapshot.scene.layers.find((layer) => layer.id === asset.layerId)?.visible ?? false
      : false;
    return {
      asset_origin: [transform.x, transform.y],
      asset_size: [transform.width, transform.height],
      asset_rotation: (transform.rotation * Math.PI) / 180,
      selected: asset && plan.showEditorGrid && snapshot.selectedAssetId === asset.id && asset.visible && layerVisible ? 1 : 0,
    };
  };
  const createAssetEntries = (
    sourceSnapshot: SceneEngineSnapshot,
    uploads: readonly ImageTextureUpload[]
  ): { readonly id: string; readonly drawable: Draw; readonly texture: Texture }[] =>
    sourceSnapshot.scene.assets.map((asset, index) => {
      const upload = uploads[index] ?? createFallbackImageUpload();
      const texture = gpu.device.createTexture({
        size: [upload.width, upload.height],
        format: "rgba8unorm-srgb",
        usage: ["copy_dst", "texture_binding", "render_attachment"],
        label: `scene-image:${asset.id}`,
      });
      upload.upload(gpu, texture);
      return {
        id: asset.id,
        texture,
        drawable: draw(gpu, {
          shader: shaders.assets,
          vertices: 6,
          instances: 1,
          blend: "premultiplied",
          label: `asset:${asset.id}`,
          set: {
            map_texture: texture,
            texture_sampler: imageSampler,
            params: assetParams(asset),
          },
        }),
      };
    });
  let assetEntries = createAssetEntries(initialSnapshot, imageUploads);
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
    Exclude<ScenePass, "asset-background">,
    { drawable: Draw | Effect; output: Target; clear: readonly [number, number, number, number] }
  > = {
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
      await Promise.all([
        ...assetEntries.map((entry) => entry.drawable.compile(signature(scene))),
        ...plan.passes
          .filter((name): name is Exclude<ScenePass, "asset-background"> => name !== "asset-background")
          .map((name) => passes[name].drawable.compile(signature(passes[name].output))),
      ]);
      await gpu.settled();
    },
    async replaceAssets(nextSnapshot, uploads) {
      const nextEntries = createAssetEntries(nextSnapshot, uploads);
      await Promise.all(nextEntries.map((entry) => entry.drawable.compile(signature(scene))));
      await gpu.settled();
      const previousEntries = assetEntries;
      assetEntries = nextEntries;
      snapshot = nextSnapshot;
      previousEntries.forEach((entry) => entry.texture.destroy());
    },
    async render(time) {
      const params = spatialParams(time);
      for (const entry of assetEntries) {
        const asset = snapshot.scene.assets.find((candidate) => candidate.id === entry.id);
        if (asset) entry.drawable.set({ params: assetParams(asset, time) });
      }
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
          if (name === "asset-background") {
            currentFrame.pass({ target: scene, clear: [0, 0, 0, 1] }, (pass) => {
              for (const asset of snapshot.scene.assets) {
                const layerVisible = snapshot.scene.layers.find((layer) => layer.id === asset.layerId)?.visible ?? false;
                if (!asset.visible || !layerVisible) continue;
                const entry = assetEntries.find((candidate) => candidate.id === asset.id);
                if (entry) pass.draw(entry.drawable);
              }
            });
            continue;
          }
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
