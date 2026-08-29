import { draw, effect, frame, geometry, sampler, storage, target } from "vgpu";
import type { Draw, Effect, Geometry, Gpu, StorageBuffer, Target, TargetSignature, Texture } from "vgpu";

import type { SceneEngineSnapshot } from "../../engine/scene-engine";
import type { SceneLight } from "../../engine/scene-document";
import { fogHandleVertices, outlineFogPolygons, outlineWallPolygons, tessellateFogPolygons, wallSegmentVertices } from "../fog-geometry";
import { createFallbackImageUpload } from "../image-texture";
import type { ImageTextureUpload } from "../image-texture";
import { compileSceneLayerOperations, FOG_EDGE_SPREAD_GRID } from "../render-plan";
import type { RenderPlan } from "../render-plan";
import { compileProjection, gridToTargetPx, projectionUniforms } from "../projection";
import type { CompiledProjection, RenderView } from "../projection";
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
  readonly lightCoverageEffects: readonly Effect[];
  readonly lightGuides: readonly Effect[];
  readonly wallStorage: StorageBuffer & { destroy(): void };
  readonly lightStorage: StorageBuffer & { destroy(): void };
  reachabilityTexture: Texture;
  readonly wallSegmentCount: number;
  readonly geometries: readonly Geometry[];
}

const RADIANCE_SCALE = 4;
const MAX_RADIANCE_CASCADES = 6;
const MAX_JFA_STEPS = 16;

function radianceConfig(size: readonly [number, number], view: RenderView) {
  const maxWidth = Math.max(1, Math.ceil(size[0] / RADIANCE_SCALE));
  const maxHeight = Math.max(1, Math.ceil(size[1] / RADIANCE_SCALE));
  const tableAspect = view.display.resolutionPx.width / view.display.resolutionPx.height;
  const field = maxWidth / maxHeight > tableAspect
    ? [Math.max(1, Math.ceil(maxHeight * tableAspect)), maxHeight] as const
    : [maxWidth, Math.max(1, Math.ceil(maxWidth / tableAspect))] as const;
  const cascadeCount = Math.min(MAX_RADIANCE_CASCADES, Math.max(5, Math.ceil(Math.log(1 + 1.5 * Math.hypot(...field)) / Math.log(4))));
  const spacing = 2 ** (cascadeCount - 1);
  const atlas = [Math.ceil(field[0] / spacing) * spacing * 2, Math.ceil(field[1] / spacing) * spacing * 2] as const;
  const jumpCount = Math.ceil(Math.log2(Math.max(...field, 2)));
  const jumps = [...Array.from({ length: jumpCount }, (_, index) => Math.max(1, 2 ** (jumpCount - index - 1))), 1, 1];
  return { field, atlas, cascadeCount, jumps };
}

function radianceLightData(lights: readonly SceneLight[]): Float32Array<ArrayBuffer> {
  return new Float32Array(lights.flatMap((light) => [
    light.position.x,
    light.position.y,
    light.brightLightDistance,
    light.dimLightDistance,
    light.color.r / 255,
    light.color.g / 255,
    light.color.b / 255,
    light.color.a / 255,
  ]));
}

type FogLayer = Extract<SceneEngineSnapshot["scene"]["layers"][number], { readonly type: "fog" }>;

function createReachabilityTexture(gpu: Gpu, size: readonly [number, number], label: string): Texture {
  return gpu.device.createTexture({
    size,
    format: "rgba8unorm",
    usage: ["copy_dst", "texture_binding"],
    label,
  });
}

function uploadReachability(gpu: Gpu, texture: Texture, size: readonly [number, number], layer: FogLayer, projection: CompiledProjection): void {
  const [width, height] = size;
  const blocked = new Uint8Array(width * height);
  const segmentData = wallSegmentVertices(layer.obstructionPolygons);
  const wallRadius = Math.max(1.5, projection.pixelsPerGrid / 64);
  for (let index = 0; index < segmentData.length; index += 4) {
    const start = gridToTargetPx({ x: segmentData[index], y: segmentData[index + 1] }, projection);
    const end = gridToTargetPx({ x: segmentData[index + 2], y: segmentData[index + 3] }, projection);
    const minimumX = Math.max(0, Math.floor(Math.min(start.x, end.x) - wallRadius));
    const maximumX = Math.min(width - 1, Math.ceil(Math.max(start.x, end.x) + wallRadius));
    const minimumY = Math.max(0, Math.floor(Math.min(start.y, end.y) - wallRadius));
    const maximumY = Math.min(height - 1, Math.ceil(Math.max(start.y, end.y) + wallRadius));
    const edgeX = end.x - start.x;
    const edgeY = end.y - start.y;
    const edgeLengthSquared = Math.max(edgeX * edgeX + edgeY * edgeY, 0.000001);
    for (let y = minimumY; y <= maximumY; y++) {
      for (let x = minimumX; x <= maximumX; x++) {
        const amount = Math.max(0, Math.min(1, ((x + 0.5 - start.x) * edgeX + (y + 0.5 - start.y) * edgeY) / edgeLengthSquared));
        const deltaX = x + 0.5 - (start.x + edgeX * amount);
        const deltaY = y + 0.5 - (start.y + edgeY * amount);
        if (deltaX * deltaX + deltaY * deltaY <= wallRadius * wallRadius) blocked[y * width + x] = 1;
      }
    }
  }

  const transmission = new Float32Array(width * height);
  const queue = new Int32Array(width * height);
  const neighbours = new Int32Array(4);
  for (const light of layer.lightSources) {
    if (light.color.a === 0) continue;
    const position = gridToTargetPx(light.position, projection);
    const centerX = Math.max(0, Math.min(width - 1, Math.floor(position.x)));
    const centerY = Math.max(0, Math.min(height - 1, Math.floor(position.y)));
    let seed = centerY * width + centerX;
    if (blocked[seed]) {
      let found = false;
      for (let radius = 1; radius <= 3 && !found; radius++) {
        for (let y = Math.max(0, centerY - radius); y <= Math.min(height - 1, centerY + radius) && !found; y++) {
          for (let x = Math.max(0, centerX - radius); x <= Math.min(width - 1, centerX + radius); x++) {
            const candidate = y * width + x;
            if (!blocked[candidate]) {
              seed = candidate;
              found = true;
              break;
            }
          }
        }
      }
      if (!found) continue;
    }
    const seedX = seed % width;
    const seedY = Math.floor(seed / width);
    const maximumDistance = Math.ceil(Math.max(light.brightLightDistance, light.dimLightDistance) * projection.pixelsPerGrid);
    const distance = new Int32Array(width * height);
    distance.fill(-1);
    distance[seed] = 0;
    let readIndex = 0;
    let writeIndex = 0;
    queue[writeIndex++] = seed;
    while (readIndex < writeIndex) {
      const current = queue[readIndex++];
      const currentDistance = distance[current];
      const x = current % width;
      const y = Math.floor(current / width);
      const unobstructedDistance = Math.abs(x - seedX) + Math.abs(y - seedY);
      const detourGrid = Math.max(0, currentDistance - unobstructedDistance) / projection.pixelsPerGrid;
      transmission[current] = Math.max(transmission[current], Math.exp(-1.5 * detourGrid));
      if (currentDistance >= maximumDistance) continue;
      neighbours[0] = x > 0 ? current - 1 : -1;
      neighbours[1] = x + 1 < width ? current + 1 : -1;
      neighbours[2] = y > 0 ? current - width : -1;
      neighbours[3] = y + 1 < height ? current + width : -1;
      for (const neighbour of neighbours) {
        if (neighbour < 0 || blocked[neighbour] || distance[neighbour] >= 0) continue;
        distance[neighbour] = currentDistance + 1;
        queue[writeIndex++] = neighbour;
      }
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < transmission.length; index++) {
    const value = Math.round(transmission[index] * 255);
    pixels.set([value, value, value, 255], index * 4);
  }
  gpu.gpu.queue.writeTexture(
    { texture: texture.gpu },
    pixels,
    { bytesPerRow: width * 4, rowsPerImage: height },
    [width, height, 1]
  );
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
  const lightCoverageTarget = target(gpu, { size, format: "rgba16float", msaa: 4, label: "light-coverage" });
  const compositeTarget = target(gpu, { size, format: "rgba16float", msaa: 4, label: "editor-composite" });
  let radiance = radianceConfig(size, initialView);
  const radianceEmitter = target(gpu, { size: radiance.field, format: "rgba16float", label: "radiance-emitter" });
  const radianceJfa = [
    target(gpu, { size: radiance.field, format: "rgba32float", label: "radiance-jfa-a" }),
    target(gpu, { size: radiance.field, format: "rgba32float", label: "radiance-jfa-b" }),
  ] as const;
  const radianceSdf = target(gpu, { size: radiance.field, format: "rgba16float", label: "radiance-sdf" });
  const radianceCascades = [
    target(gpu, { size: radiance.atlas, format: "rgba16float", label: "radiance-cascade-a" }),
    target(gpu, { size: radiance.atlas, format: "rgba16float", label: "radiance-cascade-b" }),
  ] as const;
  const indirectLightTarget = target(gpu, { size: radiance.field, format: "rgba16float", label: "indirect-light" });
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
      const lightData = radianceLightData(layer.lightSources);
      const lightStorage = storage(gpu, Math.max(32, lightData.byteLength)) as StorageBuffer & { destroy(): void };
      if (lightData.byteLength > 0) lightStorage.write(lightData);
      const reachabilityTexture = createReachabilityTexture(gpu, radiance.field, `radiance-reachability:${layer.id}`);
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
      const lightCoverageEffects = layer.lightSources.map((light, index) => effect(gpu, shaders.lightCoverage, {
        label: `light-coverage:${layer.id}:${index}`,
        blend: "additive",
        set: { params: {
          ...spatialParams(),
          light_position: [light.position.x, light.position.y],
          bright_distance: light.brightLightDistance,
          dim_distance: light.dimLightDistance,
        } },
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
        lightCoverageEffects,
        lightGuides,
        wallStorage,
        lightStorage,
        reachabilityTexture,
        wallSegmentCount: segmentData.length / 4,
        geometries: [fog?.geometry, clear?.geometry, fogGuide?.geometry, clearGuide?.geometry, wallGuideGeometry, handleGeometry].filter((item): item is Geometry => item !== undefined),
      }];
    });

  let assetEntries = createAssetEntries(initialSnapshot, imageUploads);
  let fogEntries = createFogEntries(initialSnapshot);
  const emptyWallStorage = storage(gpu, 16);
  const emptyLightStorage = storage(gpu, 32);
  let emptyReachabilityTexture = createReachabilityTexture(gpu, radiance.field, "empty-radiance-reachability");
  const radianceSpatialParams = () => projectionUniforms(compileProjection(
    { kind: "output", table: view.table, display: view.display },
    { width: radiance.field[0], height: radiance.field[1] }
  ));
  const fogCompositeParams = (hasLights: number) => {
    const sceneSpatial = spatialParams();
    const radianceSpatial = radianceSpatialParams();
    return {
      fog_opacity: plan.fogOpacity,
      has_lights: hasLights,
      target_size: sceneSpatial.target_size,
      target_to_grid_offset: sceneSpatial.target_to_grid_offset,
      pixels_per_grid: sceneSpatial.pixels_per_grid,
      radiance_target_size: radianceSpatial.target_size,
      grid_to_radiance_offset: radianceSpatial.grid_to_target_offset,
      radiance_pixels_per_grid: radianceSpatial.pixels_per_grid,
    };
  };
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
  const radianceSeed = effect(gpu, shaders.radianceSeed, {
    label: "radiance-wall-seed",
    set: {
      segments: emptyWallStorage,
      lights: emptyLightStorage,
      params: {
        target_size: radianceSpatialParams().target_size,
        target_to_grid_offset: radianceSpatialParams().target_to_grid_offset,
        pixels_per_grid: radianceSpatialParams().pixels_per_grid,
        segment_count: 0,
        light_count: 0,
        bounce_gain: 1,
        floor_gain: 0.035,
      },
    },
  });
  const radianceJfaInit = effect(gpu, shaders.radianceJfaInit, { set: { emitter: radianceEmitter } });
  const radianceJfaSteps = Array.from({ length: MAX_JFA_STEPS }, () => effect(gpu, shaders.radianceJfaPass, {
    set: { params: { jump: [1, 0, 0, 0] }, seeds: radianceJfa[0] },
  }));
  const radianceSdfFinalize = effect(gpu, shaders.radianceSdfFinalize, { set: { seeds: radianceJfa[0] } });
  const radianceCascadeEffects = Array.from({ length: MAX_RADIANCE_CASCADES }, () => effect(gpu, shaders.radianceCascade, {
    set: {
      params: { state: [0, 0, 0, 0] },
      sdf_tex: radianceSdf,
      sdf_sampler: linearSampler,
      emitter_tex: radianceEmitter,
      emitter_sampler: linearSampler,
      upper_tex: radianceCascades[1],
    },
  }));
  const radianceResolve = effect(gpu, shaders.radianceResolve, { set: { cascade_tex: radianceCascades[0], field_size: radiance.field } });
  const fogComposite = effect(gpu, shaders.fogComposite, {
    label: "fog-composite",
    set: { scene: sceneA, fog_mask: featheredFogTarget, light: lightTarget, light_coverage: lightCoverageTarget, indirect_light: indirectLightTarget, indirect_reachability: emptyReachabilityTexture, texture_sampler: linearSampler, params: fogCompositeParams(0) },
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
  const updateRadianceLayout = (nextSize: readonly [number, number]) => {
    const next = radianceConfig(nextSize, view);
    if (next.field[0] !== radiance.field[0] || next.field[1] !== radiance.field[1]) {
      radianceEmitter.resize(next.field);
      radianceJfa[0].resize(next.field);
      radianceJfa[1].resize(next.field);
      radianceSdf.resize(next.field);
      indirectLightTarget.resize(next.field);
      emptyReachabilityTexture.destroy();
      emptyReachabilityTexture = createReachabilityTexture(gpu, next.field, "empty-radiance-reachability");
      for (const entry of fogEntries) {
        entry.reachabilityTexture.destroy();
        entry.reachabilityTexture = createReachabilityTexture(gpu, next.field, `radiance-reachability:${entry.layerId}`);
      }
    }
    if (next.atlas[0] !== radiance.atlas[0] || next.atlas[1] !== radiance.atlas[1]) {
      radianceCascades[0].resize(next.atlas);
      radianceCascades[1].resize(next.atlas);
    }
    radiance = next;
  };

  return {
    lightFormat: "rgba16float",
    sampleCount: 4,
    get estimatedTargetBytes() {
      const [width, height] = destination.size;
      const [fieldWidth, fieldHeight] = radiance.field;
      const [atlasWidth, atlasHeight] = radiance.atlas;
      return width * height * (8 * 5 + 8 * 5 + 4 * 5 + 4 + 8 * 5 + 4)
        + fieldWidth * fieldHeight * (8 * 3 + 16 * 2)
        + atlasWidth * atlasHeight * 8 * 2;
    },
    async prewarm() {
      await Promise.all([
        ...assetEntries.map((entry) => entry.drawable.compile(signature(sceneA))),
        ...fogEntries.flatMap((entry) => [entry.fog, entry.clear].filter((item): item is Draw => item !== undefined))
          .map((drawable) => drawable.compile(signature(fogMaskTarget))),
        ...fogEntries.flatMap((entry) => entry.lightEffects).map((drawable) => drawable.compile(signature(lightTarget))),
        ...fogEntries.flatMap((entry) => entry.lightCoverageEffects).map((drawable) => drawable.compile(signature(lightCoverageTarget))),
        radianceSeed.compile(signature(radianceEmitter)),
        radianceJfaInit.compile(signature(radianceJfa[0])),
        ...radianceJfaSteps.map((drawable) => drawable.compile(signature(radianceJfa[0]))),
        radianceSdfFinalize.compile(signature(radianceSdf)),
        ...radianceCascadeEffects.map((drawable) => drawable.compile(signature(radianceCascades[0]))),
        radianceResolve.compile(signature(indirectLightTarget)),
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
      await Promise.all(nextEntries.flatMap((entry) => entry.lightCoverageEffects).map((drawable) => drawable.compile(signature(lightCoverageTarget))));
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
      previousEntries.forEach((entry) => entry.lightStorage.destroy());
      previousEntries.forEach((entry) => entry.reachabilityTexture.destroy());
    },
    async render() {
      for (const entry of assetEntries) {
        const asset = snapshot.scene.assets.find((candidate) => candidate.id === entry.id);
        if (asset) entry.drawable.set({ params: assetParams(asset) });
      }
      for (const entry of fogEntries) {
        const layer = snapshot.scene.layers.find((candidate) => candidate.id === entry.layerId);
        if (layer?.type !== "fog") continue;
        if (layer.lightSources.length > 0) entry.lightStorage.write(radianceLightData(layer.lightSources));
        uploadReachability(gpu, entry.reachabilityTexture, radiance.field, layer, compileProjection(
          { kind: "output", table: view.table, display: view.display },
          { width: radiance.field[0], height: radiance.field[1] }
        ));
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
          entry.lightCoverageEffects[index]?.set({ params: {
            ...spatialParams(),
            light_position: [light.position.x, light.position.y],
            bright_distance: light.brightLightDistance,
            dim_distance: light.dimLightDistance,
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
          currentFrame.pass({ target: lightCoverageTarget, clear: [0, 0, 0, 0] }, (pass) => {
            for (const light of entry?.lightCoverageEffects ?? []) pass.draw(light);
          });
          const hasIndirect = Boolean(entry?.lightEffects.length && entry.wallSegmentCount);
          if (hasIndirect && entry) {
            const lowSpatial = radianceSpatialParams();
            radianceSeed.set({
              segments: entry.wallStorage,
              lights: entry.lightStorage,
              params: {
                target_size: lowSpatial.target_size,
                target_to_grid_offset: lowSpatial.target_to_grid_offset,
                pixels_per_grid: lowSpatial.pixels_per_grid,
                segment_count: entry.wallSegmentCount,
                light_count: entry.lightEffects.length,
              },
            });
            currentFrame.pass({ target: radianceEmitter, clear: [0, 0, 0, 0] }, radianceSeed);
            radianceJfaInit.set({ emitter: radianceEmitter });
            currentFrame.pass({ target: radianceJfa[0], clear: [0, 0, 0, 0] }, radianceJfaInit);
            let seedRead = radianceJfa[0];
            let seedWrite = radianceJfa[1];
            radiance.jumps.forEach((jump, index) => {
              const step = radianceJfaSteps[index];
              step.set({ params: { jump: [jump, 0, 0, 0] }, seeds: seedRead });
              currentFrame.pass({ target: seedWrite, clear: [0, 0, 0, 0] }, step);
              [seedRead, seedWrite] = [seedWrite, seedRead];
            });
            radianceSdfFinalize.set({ seeds: seedRead });
            currentFrame.pass({ target: radianceSdf, clear: [0, 0, 0, 0] }, radianceSdfFinalize);
            let cascadeRead = radianceCascades[1];
            let cascadeWrite = radianceCascades[0];
            for (let cascade = radiance.cascadeCount - 1; cascade >= 0; cascade--) {
              const cascadeEffect = radianceCascadeEffects[cascade];
              cascadeEffect.set({
                params: { state: [cascade, cascade < radiance.cascadeCount - 1 ? 1 : 0, 0, 0] },
                upper_tex: cascadeRead,
              });
              currentFrame.pass({ target: cascadeWrite, clear: [0, 0, 0, 0] }, cascadeEffect);
              [cascadeRead, cascadeWrite] = [cascadeWrite, cascadeRead];
            }
            radianceResolve.set({ cascade_tex: cascadeRead, field_size: radiance.field });
            currentFrame.pass({ target: indirectLightTarget, clear: [0, 0, 0, 0] }, radianceResolve);
          } else {
            currentFrame.pass({ target: indirectLightTarget, clear: [0, 0, 0, 0] }, () => undefined);
          }
          fogComposite.set({
            scene: activeScene,
            light: lightTarget,
            indirect_reachability: entry?.reachabilityTexture ?? emptyReachabilityTexture,
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
      lightCoverageTarget.resize(nextSize);
      compositeTarget.resize(nextSize);
      updateRadianceLayout(nextSize);
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
      updateRadianceLayout([renderSize.width, renderSize.height]);
    },
  };
}
