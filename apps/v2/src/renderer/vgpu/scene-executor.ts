import { draw, effect, frame, geometry, sampler, storage, target } from "vgpu";
import type { Draw, Effect, Geometry, Gpu, StorageBuffer, Target, TargetSignature, Texture } from "vgpu";

import type { SceneEngineSnapshot } from "../../engine/scene-engine";
import { fogHandleVertices, outlineFogPolygons, outlineWallPolygons, tessellateFogPolygons, wallSegmentVertices } from "../fog-geometry";
import { createFallbackImageUpload } from "../image-texture";
import type { ImageTextureUpload } from "../image-texture";
import { compileSceneLayerOperations, FOG_EDGE_SPREAD_GRID } from "../render-plan";
import type { RenderPlan } from "../render-plan";
import { compileProjection, projectionUniforms } from "../projection";
import type { RenderView } from "../projection";
import type { SceneShaders } from "./scene-shaders";

export interface SceneExecutor {
  readonly lightFormat: "rgba16float";
  readonly sampleCount: 4;
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
  readonly wallGuide?: Draw;
  readonly handles?: Draw;
  readonly lightEffects: readonly Effect[];
  readonly lightGuides: readonly Effect[];
  readonly wallStorage: StorageBuffer & { destroy(): void };
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
  const sceneA = target(gpu, { size, format: "rgba16float", msaa: 4, label: "scene-a" });
  const sceneB = target(gpu, { size, format: "rgba16float", msaa: 4, label: "scene-b" });
  const fogMaskTarget = target(gpu, { size, format: "rgba8unorm", msaa: 4, label: "fog-mask" });
  const featheredFogTarget = target(gpu, { size, format: "rgba8unorm", label: "feathered-fog-mask" });
  const lightTarget = target(gpu, { size, format: "rgba16float", msaa: 4, label: "light-accumulation" });
  const compositeTarget = target(gpu, { size, format: "rgba16float", msaa: 4, label: "editor-composite" });
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
      interaction_point: [snapshot.fogCursorPoint?.x ?? 0, snapshot.fogCursorPoint?.y ?? 0],
      snap_point: [snapshot.gridSnapPoint?.x ?? 0, snapshot.gridSnapPoint?.y ?? 0],
      interaction_active: snapshot.fogCursorPoint && plan.showEditorGrid ? 1 : 0,
      interaction_clear: snapshot.fogCursorCollection === "clear" ? 1 : 0,
      interaction_wall: snapshot.fogCursorCollection === "wall" ? 1 : 0,
      snap_active: snapshot.gridSnapPoint && plan.showEditorGrid ? 1 : 0,
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
      const wallVertices = outlineWallPolygons(layer.obstructionPolygons);
      const wallGuideGeometry = wallVertices ? geometry(gpu, {
        buffers: [{ attributes: { point_grid: { format: "float32x2", location: 0 } }, data: wallVertices }],
        topology: "line-list",
        label: `wall-guide:${layer.id}`,
      }) : undefined;
      const wallGuide = wallGuideGeometry ? draw(gpu, {
        shader: shaders.fogGuide,
        geometry: wallGuideGeometry,
        blend: "premultiplied",
        label: `wall-guide:${layer.id}`,
        set: { params: { ...spatialParams(), color: [1.0, 0.58, 0.12, 0.95] } },
      }) : undefined;
      const selection = sourceSnapshot.selectedFogPolygon?.layerId === layer.id
        ? sourceSnapshot.selectedFogPolygon
        : undefined;
      const selectedPolygon = selection
        ? (selection.collection === "fog" ? layer.fogPolygons : selection.collection === "clear" ? layer.fogClearPolygons : layer.obstructionPolygons)[selection.polygonIndex]
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
        set: { params: { ...spatialParams(), color: selection?.collection === "fog" ? [0.82, 0.2, 0.95, 1] : selection?.collection === "clear" ? [0.12, 0.68, 1, 1] : [1.0, 0.58, 0.12, 1] } },
      }) : undefined;
      const segmentData = wallSegmentVertices(layer.obstructionPolygons);
      const wallStorage = storage(gpu, Math.max(16, segmentData.byteLength)) as StorageBuffer & { destroy(): void };
      if (segmentData.byteLength > 0) wallStorage.write(segmentData);
      const lightEffects = layer.lightSources.map((light, index) => effect(gpu, shaders.lightAccumulation, {
        label: `light:${layer.id}:${index}`,
        blend: "additive",
        set: {
          segments: wallStorage,
          params: {
            ...spatialParams(),
            light_position: [light.position.x, light.position.y],
            bright_distance: light.brightLightDistance,
            dim_distance: light.dimLightDistance,
            segment_count: segmentData.length / 4,
            color: [light.color.r / 255, light.color.g / 255, light.color.b / 255, 1],
            energy: light.color.a / 255,
          },
        },
      }));
      const lightGuides = layer.lightSources.map((light, index) => effect(gpu, shaders.lightGuide, {
        label: `light-guide:${layer.id}:${index}`,
        blend: "premultiplied",
        set: { params: {
          ...spatialParams(),
          position: [light.position.x, light.position.y],
          bright_distance: light.brightLightDistance,
          dim_distance: light.dimLightDistance,
          color: [light.color.r / 255, light.color.g / 255, light.color.b / 255, 1],
          energy: light.color.a / 255,
          selected: sourceSnapshot.selectedLight?.layerId === layer.id && sourceSnapshot.selectedLight.lightIndex === index ? 1 : 0,
        } },
      }));
      return [{
        layerId: layer.id,
        fog: fog?.drawable,
        clear: clear?.drawable,
        fogGuide: fogGuide?.drawable,
        clearGuide: clearGuide?.drawable,
        wallGuide,
        handles,
        lightEffects,
        lightGuides,
        wallStorage,
        geometries: [fog?.geometry, clear?.geometry, fogGuide?.geometry, clearGuide?.geometry, wallGuideGeometry, handleGeometry].filter((item): item is Geometry => item !== undefined),
      }];
    });

  let assetEntries = createAssetEntries(initialSnapshot, imageUploads);
  let fogEntries = createFogEntries(initialSnapshot);
  const fogCompositeParams = (hasLights: number) => ({ fog_opacity: plan.fogOpacity, has_lights: hasLights });
  const fogFeather = effect(gpu, shaders.fogFeather, {
    label: "fog-edge-feather",
    set: {
      fog_mask: fogMaskTarget,
      texture_sampler: linearSampler,
      params: {
        target_size: [renderSize.width, renderSize.height],
        pixels_per_grid: projection.pixelsPerGrid,
        spread_grid: FOG_EDGE_SPREAD_GRID,
      },
    },
  });
  const fogComposite = effect(gpu, shaders.fogComposite, {
    label: "fog-composite",
    set: { scene: sceneA, fog_mask: featheredFogTarget, light: lightTarget, texture_sampler: linearSampler, params: fogCompositeParams(0) },
  });
  const sceneCopy = effect(gpu, shaders.sceneCopy, {
    label: "scene-layer-copy",
    set: { scene: sceneA, texture_sampler: linearSampler },
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
    sampleCount: 4,
    get estimatedTargetBytes() {
      const [width, height] = destination.size;
      return width * height * (8 * 5 + 8 * 5 + 4 * 5 + 4 + 8 * 5 + 4);
    },
    async prewarm() {
      await Promise.all([
        ...assetEntries.map((entry) => entry.drawable.compile(signature(sceneA))),
        ...fogEntries.flatMap((entry) => [entry.fog, entry.clear].filter((item): item is Draw => item !== undefined))
          .map((drawable) => drawable.compile(signature(fogMaskTarget))),
        ...fogEntries.flatMap((entry) => entry.lightEffects).map((drawable) => drawable.compile(signature(lightTarget))),
        ...(plan.showEditorGrid
          ? [
              ...fogEntries.flatMap((entry) => [entry.fogGuide, entry.clearGuide, entry.wallGuide, entry.handles].filter((item): item is Draw => item !== undefined)),
              ...fogEntries.flatMap((entry) => entry.lightGuides),
            ].map((drawable) => drawable.compile(signature(compositeTarget)))
          : []),
        fogComposite.compile(signature(sceneB)),
        fogFeather.compile(signature(featheredFogTarget)),
        sceneCopy.compile(signature(sceneB)),
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
      await Promise.all(nextEntries.flatMap((entry) => entry.lightEffects).map((drawable) => drawable.compile(signature(lightTarget))));
      if (plan.showEditorGrid) {
        await Promise.all([
          ...nextEntries.flatMap((entry) => [entry.fogGuide, entry.clearGuide, entry.wallGuide, entry.handles].filter((item): item is Draw => item !== undefined)),
          ...nextEntries.flatMap((entry) => entry.lightGuides),
        ].map((drawable) => drawable.compile(signature(compositeTarget))));
      }
      await gpu.settled();
      const previousEntries = fogEntries;
      fogEntries = nextEntries;
      snapshot = nextSnapshot;
      previousEntries.flatMap((entry) => entry.geometries).forEach((item) => item.destroy());
      previousEntries.forEach((entry) => entry.wallStorage.destroy());
    },
    async render() {
      for (const entry of assetEntries) {
        const asset = snapshot.scene.assets.find((candidate) => candidate.id === entry.id);
        if (asset) entry.drawable.set({ params: assetParams(asset) });
      }
      for (const entry of fogEntries) {
        const layer = snapshot.scene.layers.find((candidate) => candidate.id === entry.layerId);
        if (layer?.type !== "fog") continue;
        entry.fog?.set({ params: { ...spatialParams(), fog_value: 1 } });
        entry.clear?.set({ params: { ...spatialParams(), fog_value: 0 } });
        entry.fogGuide?.set({ params: { ...spatialParams(), color: [0.82, 0.2, 0.95, 0.9] } });
        entry.clearGuide?.set({ params: { ...spatialParams(), color: [0.12, 0.68, 1, 0.9] } });
        entry.wallGuide?.set({ params: { ...spatialParams(), color: [1.0, 0.58, 0.12, 0.95] } });
        const handleSelection = snapshot.selectedFogPolygon;
        entry.handles?.set({
          params: {
            ...spatialParams(),
            color: handleSelection?.collection === "fog" ? [0.82, 0.2, 0.95, 1] : handleSelection?.collection === "clear" ? [0.12, 0.68, 1, 1] : [1.0, 0.58, 0.12, 1],
          },
        });
        layer.lightSources.forEach((light, index) => {
          entry.lightEffects[index]?.set({ params: {
            ...spatialParams(),
            light_position: [light.position.x, light.position.y],
            bright_distance: light.brightLightDistance,
            dim_distance: light.dimLightDistance,
            color: [light.color.r / 255, light.color.g / 255, light.color.b / 255, 1],
            energy: light.color.a / 255,
          } });
          entry.lightGuides[index]?.set({ params: {
            ...spatialParams(),
            position: [light.position.x, light.position.y],
            bright_distance: light.brightLightDistance,
            dim_distance: light.dimLightDistance,
            color: [light.color.r / 255, light.color.g / 255, light.color.b / 255, 1],
            energy: light.color.a / 255,
            selected: snapshot.selectedLight?.layerId === layer.id && snapshot.selectedLight.lightIndex === index ? 1 : 0,
          } });
        });
      }
      let activeScene: Target = sceneA;
      let alternateScene: Target = sceneB;
      composite.set({
        params: { ...spatialParams(), show_editor: plan.showEditorGrid ? 1 : 0, show_grid: gridVisible ? 1 : 0, ...selectionParams() },
      });
      const operations = compileSceneLayerOperations(snapshot.scene);
      const submitted = frame(gpu, (currentFrame) => {
        currentFrame.pass({ target: activeScene, clear: [0, 0, 0, 1] }, () => undefined);
        for (const operation of operations) {
          if (operation.type === "assets") {
            sceneCopy.set({ scene: activeScene });
            currentFrame.pass({ target: alternateScene, clear: [0, 0, 0, 1] }, (pass) => {
              pass.draw(sceneCopy);
              for (const assetId of operation.assetIds) {
                const asset = snapshot.scene.assets.find((candidate) => candidate.id === assetId);
                if (!asset?.visible) continue;
                const entry = assetEntries.find((candidate) => candidate.id === assetId);
                if (entry) pass.draw(entry.drawable);
              }
            });
            [activeScene, alternateScene] = [alternateScene, activeScene];
            continue;
          }
          const entry = fogEntries.find((candidate) => candidate.layerId === operation.layerId);
          currentFrame.pass({ target: fogMaskTarget, clear: [0, 0, 0, 1] }, (pass) => {
            if (entry?.fog) pass.draw(entry.fog);
            if (entry?.clear) pass.draw(entry.clear);
          });
          fogFeather.set({
            params: {
              target_size: [renderSize.width, renderSize.height],
              pixels_per_grid: projection.pixelsPerGrid,
              spread_grid: FOG_EDGE_SPREAD_GRID,
            },
          });
          currentFrame.pass({ target: featheredFogTarget, clear: [0, 0, 0, 1] }, fogFeather);
          currentFrame.pass({ target: lightTarget, clear: [0, 0, 0, 0] }, (pass) => {
            for (const light of entry?.lightEffects ?? []) pass.draw(light);
          });
          fogComposite.set({
            scene: activeScene,
            light: lightTarget,
            params: fogCompositeParams(entry?.lightEffects.length ? 1 : 0),
          });
          currentFrame.pass({ target: alternateScene, clear: [0, 0, 0, 1] }, fogComposite);
          [activeScene, alternateScene] = [alternateScene, activeScene];
        }
        composite.set({ scene: activeScene });
        currentFrame.pass({ target: compositeTarget, clear: [0, 0, 0, 1] }, (pass) => {
          pass.draw(composite);
          if (plan.showEditorGrid) {
            for (const entry of fogEntries) {
              if (!snapshot.scene.layers.some((layer) => layer.id === entry.layerId && layer.visible)) continue;
              if (entry.fogGuide) pass.draw(entry.fogGuide);
              if (entry.clearGuide) pass.draw(entry.clearGuide);
              if (entry.wallGuide) pass.draw(entry.wallGuide);
              if (entry.handles) pass.draw(entry.handles);
              for (const light of entry.lightGuides) pass.draw(light);
            }
          }
        });
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
      featheredFogTarget.resize(nextSize);
      lightTarget.resize(nextSize);
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
