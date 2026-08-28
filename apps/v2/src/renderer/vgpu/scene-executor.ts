import { draw, effect, frame, geometry, sampler, target } from "vgpu";
import type { Draw, Geometry, Gpu, Target, TargetSignature, Texture } from "vgpu";

import type { SceneEngineSnapshot } from "../../engine/scene-engine";
import { fogHandleVertices, outlineFogPolygons, tessellateFogPolygons } from "../fog-geometry";
import { createFallbackImageUpload } from "../image-texture";
import type { ImageTextureUpload } from "../image-texture";
import { compileSceneLayerOperations } from "../render-plan";
import type { RenderPlan } from "../render-plan";
import { compileProjection, projectionUniforms } from "../projection";
import type { RenderView } from "../projection";
import type { SceneShaders } from "./scene-shaders";

export interface SceneExecutor {
  readonly lightFormat: "rgba16float";
  readonly estimatedTargetBytes: number;
  prewarm(): Promise<void>;
  replaceAssets(snapshot: SceneEngineSnapshot, uploads: readonly ImageTextureUpload[]): Promise<void>;
  replaceFog(snapshot: SceneEngineSnapshot): Promise<void>;
  render(time: number): Promise<void>;
  resize(size: readonly [number, number]): void;
  setGridVisible(visible: boolean): void;
  setTableEditing(editing: boolean): void;
  setSnapshot(snapshot: SceneEngineSnapshot): void;
  setView(view: RenderView): void;
}

interface FogDrawEntry {
  readonly layerId: string;
  readonly fog?: Draw;
  readonly clear?: Draw;
  readonly fogGuide?: Draw;
  readonly clearGuide?: Draw;
  readonly handles?: Draw;
  readonly geometries: readonly Geometry[];
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
  const sceneA = target(gpu, { size, format: "rgba16float", label: "scene-a" });
  const sceneB = target(gpu, { size, format: "rgba16float", label: "scene-b" });
  const fogMaskTarget = target(gpu, { size, format: "rgba8unorm", label: "fog-mask" });
  const compositeTarget = target(gpu, { size, format: "rgba16float", label: "editor-composite" });
  const linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  const imageSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  let gridVisible = plan.showGrid;
  let tableEditing = false;
  let view = initialView;
  let snapshot = initialSnapshot;
  let renderSize = { width: size[0], height: size[1] };
  let projection = compileProjection(view, renderSize);
  const spatialParams = () => projectionUniforms(projection);
  const assetParams = (asset: SceneEngineSnapshot["scene"]["assets"][number]) => ({
    ...spatialParams(),
    time: 0,
    asset_origin: [asset.transform.x, asset.transform.y],
    asset_size: [asset.transform.width, asset.transform.height],
    asset_rotation: (asset.transform.rotation * Math.PI) / 180,
  });
  const selectionParams = () => {
    const asset = snapshot.scene.assets.find((candidate) => candidate.id === snapshot.selectedAssetId);
    const transform = asset?.transform ?? { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
    const layerVisible = asset
      ? snapshot.scene.layers.find((layer) => layer.id === asset.layerId)?.visible ?? false
      : false;
    return {
      asset_origin: [transform.x, transform.y],
      asset_size: [transform.width, transform.height],
      asset_rotation: (transform.rotation * Math.PI) / 180,
      selected: asset && plan.showEditorGrid && asset.visible && layerVisible ? 1 : 0,
      table_editing: tableEditing && plan.showEditorGrid ? 1 : 0,
    };
  };
  const signature = (output: Target): TargetSignature => ({
    colors: output.colors.map((color) => color.format),
    depth: output.depth?.format,
    sampleCount: output.sampleCount,
  });

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
          blend: "premultiplied",
          label: `asset:${asset.id}`,
          set: { map_texture: texture, texture_sampler: imageSampler, params: assetParams(asset) },
        }),
      };
    });

  const createFogEntries = (sourceSnapshot: SceneEngineSnapshot): FogDrawEntry[] =>
    sourceSnapshot.scene.layers.flatMap((layer) => {
      if (layer.type !== "fog") return [];
      const makeDraw = (polygons: typeof layer.fogPolygons, value: number, label: string) => {
        const mesh = tessellateFogPolygons(polygons);
        if (!mesh) return undefined;
        const meshGeometry = geometry(gpu, {
          buffers: [{ attributes: { point_grid: { format: "float32x2", location: 0 } }, data: mesh.vertices }],
          indices: mesh.indices,
          topology: "triangle-list",
          label,
        });
        return {
          geometry: meshGeometry,
          drawable: draw(gpu, {
            shader: shaders.fogMask,
            geometry: meshGeometry,
            label,
            set: { params: { ...spatialParams(), fog_value: value } },
          }),
        };
      };
      const fog = makeDraw(layer.fogPolygons, 1, `fog-fill:${layer.id}`);
      const clear = makeDraw(layer.fogClearPolygons, 0, `fog-clear:${layer.id}`);
      const makeGuide = (polygons: typeof layer.fogPolygons, color: readonly number[], label: string) => {
        const vertices = outlineFogPolygons(polygons);
        if (!vertices) return undefined;
        const guideGeometry = geometry(gpu, {
          buffers: [{ attributes: { point_grid: { format: "float32x2", location: 0 } }, data: vertices }],
          topology: "line-list",
          label,
        });
        return {
          geometry: guideGeometry,
          drawable: draw(gpu, {
            shader: shaders.fogGuide,
            geometry: guideGeometry,
            blend: "premultiplied",
            label,
            set: { params: { ...spatialParams(), color } },
          }),
        };
      };
      const fogGuide = makeGuide(layer.fogPolygons, [0.82, 0.2, 0.95, 0.9], `fog-guide:${layer.id}`);
      const clearGuide = makeGuide(layer.fogClearPolygons, [0.12, 0.68, 1, 0.9], `fog-clear-guide:${layer.id}`);
      const selection = sourceSnapshot.selectedFogPolygon?.layerId === layer.id
        ? sourceSnapshot.selectedFogPolygon
        : undefined;
      const selectedPolygon = selection
        ? (selection.collection === "fog" ? layer.fogPolygons : layer.fogClearPolygons)[selection.polygonIndex]
        : undefined;
      const handleGeometry = selectedPolygon ? geometry(gpu, {
        buffers: [{
          attributes: {
            point_grid: { format: "float32x2", location: 0, offset: 0 },
            corner: { format: "float32x2", location: 1, offset: 8 },
          },
          stride: 16,
          data: fogHandleVertices(selectedPolygon),
        }],
        topology: "triangle-list",
        label: `fog-handles:${layer.id}`,
      }) : undefined;
      const handles = handleGeometry ? draw(gpu, {
        shader: shaders.fogHandle,
        geometry: handleGeometry,
        label: `fog-handles:${layer.id}`,
        set: { params: { ...spatialParams(), color: selection?.collection === "fog" ? [0.82, 0.2, 0.95, 1] : [0.12, 0.68, 1, 1] } },
      }) : undefined;
      return [{
        layerId: layer.id,
        fog: fog?.drawable,
        clear: clear?.drawable,
        fogGuide: fogGuide?.drawable,
        clearGuide: clearGuide?.drawable,
        handles,
        geometries: [fog?.geometry, clear?.geometry, fogGuide?.geometry, clearGuide?.geometry, handleGeometry].filter((item): item is Geometry => item !== undefined),
      }];
    });

  let assetEntries = createAssetEntries(initialSnapshot, imageUploads);
  let fogEntries = createFogEntries(initialSnapshot);
  const fogComposite = effect(gpu, shaders.fogComposite, {
    label: "fog-composite",
    set: { scene: sceneA, fog_mask: fogMaskTarget, texture_sampler: linearSampler, params: { fog_opacity: plan.fogOpacity } },
  });
  const composite = effect(gpu, shaders.composite, {
    label: "editor-composite",
    set: {
      scene: sceneA,
      texture_sampler: linearSampler,
      params: { ...spatialParams(), show_editor: plan.showEditorGrid ? 1 : 0, show_grid: gridVisible ? 1 : 0, ...selectionParams() },
    },
  });
  const present = effect(gpu, shaders.present, {
    label: "linear-to-display-present",
    set: { linear_scene: compositeTarget, texture_sampler: linearSampler },
  });

  return {
    lightFormat: "rgba16float",
    get estimatedTargetBytes() {
      const [width, height] = destination.size;
      return width * height * (8 + 8 + 4 + 8 + 4);
    },
    async prewarm() {
      await Promise.all([
        ...assetEntries.map((entry) => entry.drawable.compile(signature(sceneA))),
        ...fogEntries.flatMap((entry) => [entry.fog, entry.clear].filter((item): item is Draw => item !== undefined))
          .map((drawable) => drawable.compile(signature(fogMaskTarget))),
        ...(plan.showEditorGrid
          ? fogEntries.flatMap((entry) => [entry.fogGuide, entry.clearGuide, entry.handles].filter((item): item is Draw => item !== undefined))
              .map((drawable) => drawable.compile(signature(compositeTarget)))
          : []),
        fogComposite.compile(signature(sceneB)),
        composite.compile(signature(compositeTarget)),
        present.compile(signature(destination)),
      ]);
      await gpu.settled();
    },
    async replaceAssets(nextSnapshot, uploads) {
      const nextEntries = createAssetEntries(nextSnapshot, uploads);
      await Promise.all(nextEntries.map((entry) => entry.drawable.compile(signature(sceneA))));
      await gpu.settled();
      const previousEntries = assetEntries;
      assetEntries = nextEntries;
      snapshot = nextSnapshot;
      previousEntries.forEach((entry) => entry.texture.destroy());
    },
    async replaceFog(nextSnapshot) {
      const nextEntries = createFogEntries(nextSnapshot);
      await Promise.all(nextEntries.flatMap((entry) => [entry.fog, entry.clear].filter((item): item is Draw => item !== undefined))
        .map((drawable) => drawable.compile(signature(fogMaskTarget))));
      if (plan.showEditorGrid) {
        await Promise.all(nextEntries.flatMap((entry) => [entry.fogGuide, entry.clearGuide, entry.handles].filter((item): item is Draw => item !== undefined))
          .map((drawable) => drawable.compile(signature(compositeTarget))));
      }
      await gpu.settled();
      const previousEntries = fogEntries;
      fogEntries = nextEntries;
      snapshot = nextSnapshot;
      previousEntries.flatMap((entry) => entry.geometries).forEach((item) => item.destroy());
    },
    async render() {
      for (const entry of assetEntries) {
        const asset = snapshot.scene.assets.find((candidate) => candidate.id === entry.id);
        if (asset) entry.drawable.set({ params: assetParams(asset) });
      }
      for (const entry of fogEntries) {
        entry.fog?.set({ params: { ...spatialParams(), fog_value: 1 } });
        entry.clear?.set({ params: { ...spatialParams(), fog_value: 0 } });
        entry.fogGuide?.set({ params: { ...spatialParams(), color: [0.82, 0.2, 0.95, 0.9] } });
        entry.clearGuide?.set({ params: { ...spatialParams(), color: [0.12, 0.68, 1, 0.9] } });
        const handleSelection = snapshot.selectedFogPolygon;
        entry.handles?.set({
          params: {
            ...spatialParams(),
            color: handleSelection?.collection === "fog" ? [0.82, 0.2, 0.95, 1] : [0.12, 0.68, 1, 1],
          },
        });
      }
      let activeScene: Target = sceneA;
      let alternateScene: Target = sceneB;
      composite.set({
        params: { ...spatialParams(), show_editor: plan.showEditorGrid ? 1 : 0, show_grid: gridVisible ? 1 : 0, ...selectionParams() },
      });
      const submitted = frame(gpu, (currentFrame) => {
        currentFrame.pass({ target: activeScene, clear: [0, 0, 0, 1] }, () => undefined);
        for (const operation of compileSceneLayerOperations(snapshot.scene)) {
          if (operation.type === "assets") {
            currentFrame.pass({ target: activeScene, clear: false }, (pass) => {
              for (const assetId of operation.assetIds) {
                const asset = snapshot.scene.assets.find((candidate) => candidate.id === assetId);
                if (!asset?.visible) continue;
                const entry = assetEntries.find((candidate) => candidate.id === assetId);
                if (entry) pass.draw(entry.drawable);
              }
            });
            continue;
          }
          const entry = fogEntries.find((candidate) => candidate.layerId === operation.layerId);
          currentFrame.pass({ target: fogMaskTarget, clear: [0, 0, 0, 1] }, (pass) => {
            if (entry?.fog) pass.draw(entry.fog);
            if (entry?.clear) pass.draw(entry.clear);
          });
          fogComposite.set({ scene: activeScene, params: { fog_opacity: plan.fogOpacity } });
          currentFrame.pass({ target: alternateScene, clear: [0, 0, 0, 1] }, fogComposite);
          [activeScene, alternateScene] = [alternateScene, activeScene];
        }
        composite.set({ scene: activeScene });
        currentFrame.pass({ target: compositeTarget, clear: [0, 0, 0, 1] }, composite);
        if (plan.showEditorGrid) {
          currentFrame.pass({ target: compositeTarget, clear: false }, (pass) => {
            for (const entry of fogEntries) {
              if (!snapshot.scene.layers.some((layer) => layer.id === entry.layerId && layer.visible)) continue;
              if (entry.fogGuide) pass.draw(entry.fogGuide);
              if (entry.clearGuide) pass.draw(entry.clearGuide);
              if (entry.handles) pass.draw(entry.handles);
            }
          });
        }
        currentFrame.pass({ target: destination, clear: [0, 0, 0, 1] }, present);
      });
      await submitted.done;
      await gpu.settled();
    },
    resize(nextSize) {
      renderSize = { width: nextSize[0], height: nextSize[1] };
      projection = compileProjection(view, renderSize);
      sceneA.resize(nextSize);
      sceneB.resize(nextSize);
      fogMaskTarget.resize(nextSize);
      compositeTarget.resize(nextSize);
    },
    setGridVisible(visible) {
      gridVisible = visible;
    },
    setTableEditing(editing) {
      tableEditing = editing;
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
