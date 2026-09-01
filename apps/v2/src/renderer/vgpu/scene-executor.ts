import { compute, draw, effect, frame, geometry, sampler, storage, target } from "vgpu";
import type { Compute, Draw, Effect, Geometry, Gpu, StorageBuffer, Target, TargetSignature, Texture } from "vgpu";
import { createParticleEmitter } from "../particles/particle-emitter";
import type { ParticleEmitter } from "../particles/particle-emitter";

import type { SceneEngineSnapshot } from "../../engine/scene-engine";
import type { SceneEffect, SceneLight } from "../../engine/scene-document";
import { advanceEffectTransitions, createInitialEffectTransitions, hasEffectAnimationDemand, reconcileEffectTransitions } from "../effect-transitions";
import { fogHandleVertices, outlineFogPolygons, outlinePolygon, outlineWallPolygons, polygonHandleVertices, tessellateFogPolygons, wallSegmentVertices } from "../fog-geometry";
import { createFallbackImageUpload } from "../image-texture";
import type { ImageTextureUpload } from "../image-texture";
import { compileSceneLayerOperations, FOG_EDGE_SPREAD_GRID } from "../render-plan";
import type { RenderPlan, SceneLayerOperation } from "../render-plan";
import { particleEffectDefinition } from "../particle-effect-definitions";
import type { ParticleEffectDefinition } from "../particle-effect-definitions";
import { compileProjection, projectionUniforms } from "../projection";
import type { RenderView } from "../projection";
import type { SceneShaders } from "./scene-shaders";

export interface SceneExecutor {
  readonly lightFormat: "rgba16float";
  readonly sampleCount: 4;
  readonly estimatedTargetBytes: number;
  readonly effectResourceCount: number;
  readonly effectGeometryResourceCount: number;
  effectEmissionDiagnostics(time?: number): Promise<readonly EffectEmissionDiagnostic[]>;
  hasAnimationDemand(): boolean;
  prewarm(): Promise<void>;
  replaceAssets(snapshot: SceneEngineSnapshot, uploads: readonly ImageTextureUpload[]): Promise<void>;
  replaceFog(snapshot: SceneEngineSnapshot): Promise<void>;
  replaceEffects(snapshot: SceneEngineSnapshot): Promise<void>;
  render(time: number): Promise<void>;
  resize(size: readonly [number, number]): void;
  setGridVisible(visible: boolean): void;
  setTableEditing(editing: boolean): void;
  setSnapshot(snapshot: SceneEngineSnapshot): void;
  setView(view: RenderView): void;
}

export interface EffectEmissionDiagnostic {
  readonly layerId: string;
  readonly effectId: string;
  readonly currentRate: number;
  readonly targetRate: number;
  readonly liveParticles: number;
  readonly capacity: number;
  readonly emissionSequence: number;
  readonly particleLifetime: number;
  readonly liveParticleLifetimes: readonly number[];
  readonly liveParticleRecords: readonly {
    readonly slotIndex: number;
    readonly initializationSeed: number;
    readonly spawnTime: number;
    readonly lifetime: number;
    readonly contextInitializationSeed: number;
    readonly vanishingPoint: readonly [number, number];
  }[];
  readonly particleContextRecords: readonly {
    readonly slotIndex: number;
    readonly particleInitializationSeed: number;
    readonly initialized: boolean;
    readonly contextInitializationSeed: number;
    readonly vanishingPoint: readonly [number, number];
  }[];
}

interface FogDrawEntry {
  readonly layerId: string;
  readonly fog?: Draw;
  readonly clear?: Draw;
  readonly fogGuide?: Draw;
  readonly clearGuide?: Draw;
  readonly wallGuide?: Draw;
  readonly handles?: Draw;
  readonly lightEffects: readonly Draw[];
  readonly lightGuides: readonly Effect[];
  readonly radianceCascadeEffects: readonly (readonly Effect[])[];
  readonly radianceResolveEffects: readonly Effect[];
  readonly wallStorage: StorageBuffer & { destroy(): void };
  readonly lightStorage: StorageBuffer & { destroy(): void };
  readonly indirectTarget: Target;
  radianceKey: string;
  readonly wallSegmentCount: number;
  readonly geometries: readonly Geometry[];
}

interface EffectDrawEntry {
  readonly layerId: string;
  readonly effectId: string;
  readonly definition: ParticleEffectDefinition;
  readonly drawable?: Draw;
  readonly guide?: Draw;
  readonly handles?: Draw;
  readonly geometries: readonly Geometry[];
  readonly polygonStorage: StorageBuffer & { destroy(): void };
  readonly contextStorage?: StorageBuffer & { destroy(): void };
  readonly contextInitializer?: Compute;
  readonly contextBytes: number;
  readonly emitter: ParticleEmitter;
  emissionRate: number;
  targetEmissionRate: number;
  particleLifetime: number;
  steadyStatePending: boolean;
  readonly emitterMin: readonly [number, number];
  readonly emitterMax: readonly [number, number];
  readonly polygonVertexCount: number;
  readonly geometryKey: string;
}

const EDITOR_RADIANCE_SCALE = 8;
const OUTPUT_RADIANCE_SCALE = 2;
const MAX_RADIANCE_CASCADES = 6;
const WALL_BOUNCE_GAIN = 1.4;
function radianceConfig(size: readonly [number, number], view: RenderView, scale: number) {
  const maxWidth = Math.max(1, Math.ceil(size[0] / scale));
  const maxHeight = Math.max(1, Math.ceil(size[1] / scale));
  const tableAspect = view.display.resolutionPx.width / view.display.resolutionPx.height;
  const field = maxWidth / maxHeight > tableAspect
    ? [Math.max(1, Math.ceil(maxHeight * tableAspect)), maxHeight] as const
    : [maxWidth, Math.max(1, Math.ceil(maxWidth / tableAspect))] as const;
  const cascadeCount = Math.min(MAX_RADIANCE_CASCADES, Math.max(5, Math.ceil(Math.log(1 + 1.5 * Math.hypot(...field)) / Math.log(4))));
  const spacing = 2 ** (cascadeCount - 1);
  const atlas = [Math.ceil(field[0] / spacing) * spacing * 2, Math.ceil(field[1] / spacing) * spacing * 2] as const;
  return { field, atlas, cascadeCount };
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

function effectEmitterGeometry(sceneEffect: SceneEffect) {
  if (sceneEffect.vertices.length === 0) return { min: [0, 0] as const, max: [0, 0] as const, boundsArea: 0, polygonArea: 0 };
  const xs = sceneEffect.vertices.map((vertex) => vertex.x);
  const ys = sceneEffect.vertices.map((vertex) => vertex.y);
  const min = [Math.min(...xs), Math.min(...ys)] as const;
  const max = [Math.max(...xs), Math.max(...ys)] as const;
  const polygonArea = Math.abs(sceneEffect.vertices.reduce((sum, vertex, index) => {
    const next = sceneEffect.vertices[(index + 1) % sceneEffect.vertices.length];
    return sum + vertex.x * next.y - next.x * vertex.y;
  }, 0)) / 2;
  return { min, max, boundsArea: Math.max(0, max[0] - min[0]) * Math.max(0, max[1] - min[1]), polygonArea };
}

function effectPoolCapacity(emissionRate: number, maxLifetime: number): number {
  return Math.max(1, Math.min(12_000, Math.ceil(emissionRate * maxLifetime * 1.25)));
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
  const radianceScale = plan.showEditorGrid ? EDITOR_RADIANCE_SCALE : OUTPUT_RADIANCE_SCALE;
  let radiance = radianceConfig(size, initialView, radianceScale);
  const radianceCascades = [
    target(gpu, { size: radiance.atlas, format: "rgba16float", label: "radiance-cascade-a" }),
    target(gpu, { size: radiance.atlas, format: "rgba16float", label: "radiance-cascade-b" }),
  ] as const;
  const emptyIndirectLightTarget = target(gpu, {
    size: radiance.field,
    colors: [{ format: "rgba16float" }, { format: "rgba16float" }],
    label: "indirect-light",
  });
  const linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  const nearestSampler = sampler(gpu, { minFilter: "nearest", magFilter: "nearest" });
  const imageSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  let gridVisible = plan.showGrid;
  let tableEditing = false;
  let view = initialView;
  let snapshot = initialSnapshot;
  let renderSize = { width: size[0], height: size[1] };
  let projection = compileProjection(view, renderSize);
  const spatialParams = () => projectionUniforms(projection);
  const radianceSpatialParams = () => projectionUniforms(compileProjection(
    { kind: "output", table: view.table, display: view.display },
    { width: radiance.field[0], height: radiance.field[1] }
  ));
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
      interaction_point: [snapshot.fogCursorPoint?.x ?? snapshot.effectCursorPoint?.x ?? 0, snapshot.fogCursorPoint?.y ?? snapshot.effectCursorPoint?.y ?? 0],
      snap_point: [snapshot.gridSnapPoint?.x ?? 0, snapshot.gridSnapPoint?.y ?? 0],
      interaction_active: (snapshot.fogCursorPoint || snapshot.effectCursorPoint) && plan.showEditorGrid ? 1 : 0,
      interaction_clear: snapshot.fogCursorCollection === "clear" ? 1 : 0,
      interaction_wall: snapshot.fogCursorCollection === "wall" ? 1 : 0,
      interaction_effect: snapshot.effectCursorPoint && !snapshot.fogCursorPoint ? 1 : 0,
      snap_active: snapshot.gridSnapPoint && plan.showEditorGrid ? 1 : 0,
    };
  };
  const particleEffectParams = (
    sceneEffect: SceneEffect,
    time: number,
    emitterMin: readonly [number, number] = [0, 0],
    emitterMax: readonly [number, number] = [0, 0],
    polygonVertexCount = sceneEffect.vertices.length,
  ) => ({
    ...spatialParams(),
    time,
    seed: sceneEffect.seed,
    color: [sceneEffect.color.r / 255, sceneEffect.color.g / 255, sceneEffect.color.b / 255],
    opacity: sceneEffect.opacity,
    ...particleEffectDefinition(sceneEffect).liveUniforms(sceneEffect),
    emitter_min: emitterMin,
    emitter_max: emitterMax,
    polygon_vertex_count: polygonVertexCount,
  });
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
      const indirectTarget = target(gpu, {
        size: radiance.field,
        colors: [{ format: "rgba16float" }, { format: "rgba16float" }],
        label: `indirect-light:${layer.id}`,
      });
      const lightEffects = layer.lightSources.map((light, index) => draw(gpu, {
        shader: shaders.lightAccumulation,
        vertices: 6,
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
            shadow_sample_count: plan.showEditorGrid ? 2 : 4,
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
      const radianceCascadeEffects = layer.lightSources.map((_, lightIndex) =>
        Array.from({ length: MAX_RADIANCE_CASCADES }, (_, cascade) => effect(gpu, shaders.radianceCascade, {
          label: `radiance-cascade:${layer.id}:${lightIndex}:${cascade}`,
          set: {
            params: {
              state: [cascade, cascade < radiance.cascadeCount - 1 ? 1 : 0, 0, 0],
              field_size: radiance.field,
              target_to_grid_offset: radianceSpatialParams().target_to_grid_offset,
              pixels_per_grid: radianceSpatialParams().pixels_per_grid,
              segment_count: segmentData.length / 4,
              light_count: layer.lightSources.length,
              light_index: lightIndex,
              bounce_gain: WALL_BOUNCE_GAIN,
            },
            upper_tex: radianceCascades[1],
            segments: wallStorage,
            lights: lightStorage,
          },
        }))
      );
      const radianceResolveEffects = layer.lightSources.map((_, lightIndex) => effect(gpu, shaders.radianceResolve, {
        label: `radiance-resolve:${layer.id}:${lightIndex}`,
        blend: "additive",
        set: {
          cascade_tex: radianceCascades[0],
          segments: wallStorage,
          lights: lightStorage,
          params: {
            field_size: radiance.field,
            target_to_grid_offset: radianceSpatialParams().target_to_grid_offset,
            pixels_per_grid: radianceSpatialParams().pixels_per_grid,
            segment_count: segmentData.length / 4,
            light_count: layer.lightSources.length,
            light_index: lightIndex,
          },
        },
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
        radianceCascadeEffects,
        radianceResolveEffects,
        wallStorage,
        lightStorage,
        indirectTarget,
        radianceKey: "",
        wallSegmentCount: segmentData.length / 4,
        geometries: [fog?.geometry, clear?.geometry, fogGuide?.geometry, clearGuide?.geometry, wallGuideGeometry, handleGeometry].filter((item): item is Geometry => item !== undefined),
      }];
    });

  const createEffectEntry = (layerId: string, sceneEffect: SceneEffect, steadyState = false): EffectDrawEntry | undefined => {
    const definition = particleEffectDefinition(sceneEffect);
    const emitterGeometry = effectEmitterGeometry(sceneEffect);
    const maximumDensity = definition.maxDensity;
    const densityScale = plan.particleDensityScale;
    const density = Math.min(Math.max(sceneEffect.density, 0), maximumDensity) * densityScale;
    const capacityDensity = maximumDensity * densityScale;
    const visibleFraction = emitterGeometry.boundsArea > 0 ? emitterGeometry.polygonArea / emitterGeometry.boundsArea : 0;
    const emissionRate = visibleFraction > 0 ? density * emitterGeometry.polygonArea / visibleFraction : 0;
    const capacityEmissionRate = visibleFraction > 0 ? capacityDensity * emitterGeometry.polygonArea / visibleFraction : 0;
    const maxParticleLifetime = definition.maxParticleLifetime;
    const particleLifetime = definition.particleLifetime(sceneEffect.speed);
    const emitter = createParticleEmitter(gpu, {
      seed: sceneEffect.seed,
      capacity: effectPoolCapacity(capacityEmissionRate, maxParticleLifetime),
      maxLifetime: maxParticleLifetime,
      initialParticleLifetime: particleLifetime,
      rateRampSeconds: 0.24,
      label: `${sceneEffect.kind}-emitter:${sceneEffect.id}`,
    }, shaders.particleEmitter);
    const contextBytes = definition.context?.bytesPerParticle ?? 0;
    const contextStorage = definition.context
      ? storage(gpu, emitter.capacity * contextBytes) as StorageBuffer & { destroy(): void }
      : undefined;
    contextStorage?.write(new Uint8Array(emitter.capacity * contextBytes));
    const contextInitializer = contextStorage && definition.context ? compute(gpu, definition.context.shader(shaders), {
      label: `${sceneEffect.kind}-context:${sceneEffect.id}`,
      set: { particles: emitter.particleStorage, contexts: contextStorage },
    }) : undefined;
    const polygonData = new Float32Array(sceneEffect.vertices.flatMap((vertex) => [vertex.x, vertex.y]));
    const polygonStorage = storage(gpu, Math.max(8, polygonData.byteLength)) as StorageBuffer & { destroy(): void };
    if (polygonData.byteLength > 0) polygonStorage.write(polygonData);
    const guideVertices = plan.showEditorGrid ? outlinePolygon(sceneEffect.vertices) : null;
    const guideGeometry = guideVertices ? geometry(gpu, {
      buffers: [{ attributes: { point_grid: { format: "float32x2", location: 0 } }, data: guideVertices }],
      topology: "line-list",
      label: `${sceneEffect.kind}-guide:${sceneEffect.id}`,
    }) : undefined;
    const handleGeometry = plan.showEditorGrid && sceneEffect.vertices.length > 0 ? geometry(gpu, {
      buffers: [{
        attributes: {
          point_grid: { format: "float32x2", location: 0, offset: 0 },
          corner: { format: "float32x2", location: 1, offset: 8 },
        },
        stride: 16,
        data: polygonHandleVertices(sceneEffect.vertices),
      }],
      topology: "triangle-list",
      label: `${sceneEffect.kind}-handles:${sceneEffect.id}`,
    }) : undefined;
    if (capacityEmissionRate <= 0 && !guideGeometry && !handleGeometry) {
      polygonStorage.destroy();
      contextStorage?.destroy();
      emitter.dispose();
      return undefined;
    }
    return {
      layerId,
      effectId: sceneEffect.id,
      definition,
      geometries: [guideGeometry, handleGeometry].filter((item): item is Geometry => item !== undefined),
      polygonStorage,
      contextStorage,
      contextInitializer,
      contextBytes,
      emitter,
      emissionRate,
      targetEmissionRate: 0,
      particleLifetime,
      steadyStatePending: steadyState,
      emitterMin: emitterGeometry.min,
      emitterMax: emitterGeometry.max,
      polygonVertexCount: sceneEffect.vertices.length,
      geometryKey: JSON.stringify([sceneEffect.kind, sceneEffect.vertices, sceneEffect.seed]),
      drawable: capacityEmissionRate > 0 ? draw(gpu, {
        shader: definition.shader(shaders),
        vertices: 6,
        instances: emitter.capacity,
        blend: definition.blend,
        label: `${sceneEffect.kind}:${sceneEffect.id}`,
        set: {
          polygon_vertices: polygonStorage,
          particles: emitter.particleStorage,
          ...(contextStorage ? { contexts: contextStorage } : {}),
          params: particleEffectParams(sceneEffect, 0, emitterGeometry.min, emitterGeometry.max, sceneEffect.vertices.length),
        },
      }) : undefined,
      guide: guideGeometry ? draw(gpu, {
        shader: shaders.fogGuide,
        geometry: guideGeometry,
        blend: "premultiplied",
        label: `${sceneEffect.kind}-guide:${sceneEffect.id}`,
        set: { params: { ...spatialParams(), color: definition.guideColor } },
      }) : undefined,
      handles: handleGeometry ? draw(gpu, {
        shader: shaders.fogHandle,
        geometry: handleGeometry,
        blend: "premultiplied",
        label: `${sceneEffect.kind}-handles:${sceneEffect.id}`,
        set: { params: { ...spatialParams(), color: definition.handleColor } },
      }) : undefined,
    };
  };

  let assetEntries = createAssetEntries(initialSnapshot, imageUploads);
  let fogEntries = createFogEntries(initialSnapshot);
  let effectsSceneId = initialSnapshot.scene.id;
  let effectTransitions = createInitialEffectTransitions(initialSnapshot.scene);
  let effectEntries = effectTransitions.entries.flatMap((entry) => {
    if (entry.progress <= 0 && entry.target <= 0) return [];
    const effectEntry = createEffectEntry(entry.layerId, entry.effect, true);
    return effectEntry ? [effectEntry] : [];
  });
  let lastTransitionTime: number | undefined;
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
  const radianceKey = (layer: Extract<SceneEngineSnapshot["scene"]["layers"][number], { type: "fog" }>) => JSON.stringify({
    walls: layer.obstructionPolygons,
    lights: layer.lightSources,
    table: view.table,
    display: view.display,
    field: radiance.field,
    cascades: radiance.cascadeCount,
  });
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
    set: {
      scene: sceneA,
      fog_mask: featheredFogTarget,
      light: lightTarget,
      indirect_light: emptyIndirectLightTarget.colors[0],
      fog_indirect_light: emptyIndirectLightTarget.colors[1],
      texture_sampler: linearSampler,
      radiance_sampler: nearestSampler,
      params: fogCompositeParams(0),
    },
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
    const next = radianceConfig(nextSize, view, radianceScale);
    if (next.field[0] !== radiance.field[0] || next.field[1] !== radiance.field[1]) {
      emptyIndirectLightTarget.resize(next.field);
      for (const entry of fogEntries) {
        entry.indirectTarget.resize(next.field);
        entry.radianceKey = "";
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
      return width * height * (40 * 4 + 20 + 4 + 4)
        + fieldWidth * fieldHeight * 16 * (fogEntries.length + 1)
        + atlasWidth * atlasHeight * 8 * 2;
    },
    get effectResourceCount() {
      return effectEntries.length;
    },
    get effectGeometryResourceCount() {
      return effectEntries.reduce((count, entry) => count + entry.geometries.length, 0);
    },
    async effectEmissionDiagnostics(time = lastTransitionTime ?? 0) {
      return Promise.all(effectEntries.map(async (entry) => {
        const [diagnostic, contextData] = await Promise.all([
          entry.emitter.readDiagnostics(time),
          entry.contextStorage?.read(),
        ]);
        const contexts = contextData ? new DataView(contextData) : null;
        return {
          layerId: entry.layerId,
          effectId: entry.effectId,
          currentRate: diagnostic.currentRate,
          targetRate: diagnostic.targetRate,
          liveParticles: diagnostic.liveParticleCount,
          capacity: entry.emitter.capacity,
          emissionSequence: diagnostic.emissionSequence,
          particleLifetime: diagnostic.particleLifetime,
          liveParticleLifetimes: diagnostic.particles
            .filter((particle) => particle.alive && time >= particle.spawnTime && time < particle.spawnTime + particle.lifetime)
            .map((particle) => particle.lifetime),
          liveParticleRecords: diagnostic.particles
            .flatMap((particle, index) => particle.alive && time >= particle.spawnTime && time < particle.spawnTime + particle.lifetime ? [{
              slotIndex: index,
              initializationSeed: particle.initializationSeed,
              spawnTime: particle.spawnTime,
              lifetime: particle.lifetime,
              contextInitializationSeed: contexts?.getUint32(index * entry.contextBytes, true) ?? 0,
              vanishingPoint: contexts ? [
                contexts.getFloat32(index * entry.contextBytes + 8, true),
                contexts.getFloat32(index * entry.contextBytes + 12, true),
              ] as const : [0, 0] as const,
            }] : []),
          particleContextRecords: contexts ? diagnostic.particles.map((particle, index) => ({
            slotIndex: index,
            particleInitializationSeed: particle.initializationSeed,
            initialized: contexts.getUint32(index * entry.contextBytes + 4, true) !== 0,
            contextInitializationSeed: contexts.getUint32(index * entry.contextBytes, true),
            vanishingPoint: [
              contexts.getFloat32(index * entry.contextBytes + 8, true),
              contexts.getFloat32(index * entry.contextBytes + 12, true),
            ] as const,
          })) : [],
        };
      }));
    },
    hasAnimationDemand() {
      return hasEffectAnimationDemand(effectTransitions)
        || effectEntries.some((entry) => entry.emitter.hasAnimationDemand(lastTransitionTime ?? 0));
    },
    async prewarm() {
      await Promise.all([
        ...assetEntries.map((entry) => entry.drawable.compile(signature(sceneA))),
        ...fogEntries.flatMap((entry) => [entry.fog, entry.clear].filter((item): item is Draw => item !== undefined))
          .map((drawable) => drawable.compile(signature(fogMaskTarget))),
        ...fogEntries.flatMap((entry) => entry.lightEffects).map((drawable) => drawable.compile(signature(lightTarget))),
        ...fogEntries.flatMap((entry) => entry.radianceCascadeEffects.flat()).map((drawable) => drawable.compile(signature(radianceCascades[0]))),
        ...fogEntries.flatMap((entry) => entry.radianceResolveEffects).map((drawable) => drawable.compile(signature(emptyIndirectLightTarget))),
        ...effectEntries.flatMap((entry) => entry.drawable ? [entry.drawable.compile(signature(sceneA))] : []),
        ...(plan.showEditorGrid
          ? [
              ...fogEntries.flatMap((entry) => [entry.fogGuide, entry.clearGuide, entry.wallGuide, entry.handles].filter((item): item is Draw => item !== undefined)),
              ...fogEntries.flatMap((entry) => entry.lightGuides),
              ...effectEntries.flatMap((entry) => [entry.guide, entry.handles].filter((item): item is Draw => item !== undefined)),
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
      await Promise.all(nextEntries.flatMap((entry) => entry.radianceCascadeEffects.flat()).map((drawable) => drawable.compile(signature(radianceCascades[0]))));
      await Promise.all(nextEntries.flatMap((entry) => entry.radianceResolveEffects).map((drawable) => drawable.compile(signature(emptyIndirectLightTarget))));
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
      previousEntries.forEach((entry) => (entry.indirectTarget as Target & { destroy?: () => void }).destroy?.());
    },
    async replaceEffects(nextSnapshot) {
      if (nextSnapshot.scene.id !== effectsSceneId) {
        const nextTransitions = createInitialEffectTransitions(nextSnapshot.scene);
        const nextEntries = nextTransitions.entries.flatMap((transition) => {
          if (transition.progress <= 0 && transition.target <= 0) return [];
          const entry = createEffectEntry(transition.layerId, transition.effect, true);
          return entry ? [entry] : [];
        });
        await Promise.all(nextEntries.flatMap((entry) => [
          ...(entry.drawable ? [entry.drawable.compile(signature(sceneA))] : []),
          ...(plan.showEditorGrid ? [entry.guide, entry.handles]
            .filter((item): item is Draw => item !== undefined)
            .map((item) => item.compile(signature(compositeTarget))) : []),
        ]));
        await gpu.settled();
        const previousEntries = effectEntries;
        effectEntries = nextEntries;
        effectTransitions = nextTransitions;
        effectsSceneId = nextSnapshot.scene.id;
        snapshot = nextSnapshot;
        previousEntries.flatMap((entry) => entry.geometries).forEach((item) => item.destroy());
        previousEntries.forEach((entry) => entry.polygonStorage.destroy());
        previousEntries.forEach((entry) => entry.contextStorage?.destroy());
        previousEntries.forEach((entry) => entry.emitter.dispose());
        return;
      }
      const nextTransitions = reconcileEffectTransitions(effectTransitions, nextSnapshot.scene);
      const replacedEntries: EffectDrawEntry[] = [];
      const nextEntries = nextTransitions.entries.flatMap((transition) => {
        const definition = particleEffectDefinition(transition.effect);
        const density = Math.min(Math.max(transition.effect.density, 0), definition.maxDensity) * plan.particleDensityScale;
        const geometryKey = JSON.stringify([transition.effect.kind, transition.effect.vertices, transition.effect.seed]);
        const existing = effectEntries.find((entry) =>
          entry.layerId === transition.layerId && entry.effectId === transition.effect.id && entry.geometryKey === geometryKey
        );
        if (existing) {
          const emitterGeometry = effectEmitterGeometry(transition.effect);
          const visibleFraction = emitterGeometry.boundsArea > 0 ? emitterGeometry.polygonArea / emitterGeometry.boundsArea : 0;
          existing.emissionRate = visibleFraction > 0 ? density * emitterGeometry.polygonArea / visibleFraction : 0;
          existing.particleLifetime = definition.particleLifetime(transition.effect.speed);
          return [existing];
        }
        if (transition.progress <= 0 && transition.target <= 0) return [];
        const created = createEffectEntry(transition.layerId, transition.effect);
        if (!created) return [];
        replacedEntries.push(created);
        return [created];
      });
      await Promise.all(replacedEntries.flatMap((entry) => [
        ...(entry.drawable ? [entry.drawable.compile(signature(sceneA))] : []),
        ...(plan.showEditorGrid ? [entry.guide, entry.handles]
          .filter((item): item is Draw => item !== undefined)
          .map((item) => item.compile(signature(compositeTarget))) : []),
      ]));
      await gpu.settled();
      const previousEntries = effectEntries;
      effectEntries = nextEntries;
      effectTransitions = nextTransitions;
      snapshot = nextSnapshot;
      const replaced = previousEntries.filter((entry) => !nextEntries.includes(entry));
      replaced.flatMap((entry) => entry.geometries).forEach((item) => item.destroy());
      replaced.forEach((entry) => entry.polygonStorage.destroy());
      replaced.forEach((entry) => entry.contextStorage?.destroy());
      replaced.forEach((entry) => entry.emitter.dispose());
    },
    async render(time) {
      const previousTransitions = effectTransitions;
      const delta = lastTransitionTime === undefined ? 0 : Math.max(0, time - lastTransitionTime);
      lastTransitionTime = time;
      for (const entry of effectEntries) {
        const transition = effectTransitions.entries.find((candidate) => candidate.layerId === entry.layerId && candidate.effect.id === entry.effectId);
        const targetRate = transition?.target === 1 ? entry.emissionRate : 0;
        if (entry.steadyStatePending) {
          if (entry.emitter.particleLifetime !== entry.particleLifetime) {
            entry.emitter.retimeParticleLifetime(entry.particleLifetime, time);
          }
          entry.emitter.initializeSteadyState(time, targetRate);
          entry.targetEmissionRate = targetRate;
          entry.steadyStatePending = false;
        } else {
          if (entry.emitter.particleLifetime !== entry.particleLifetime) {
            entry.emitter.retimeParticleLifetime(entry.particleLifetime, time);
          }
          if (entry.targetEmissionRate !== targetRate) {
            entry.emitter.setEmissionRate(targetRate, time);
            entry.targetEmissionRate = targetRate;
          }
          entry.emitter.advance(time);
        }
        const context = entry.definition.context;
        if (entry.contextInitializer && context) {
          entry.contextInitializer.set({ params: context.params(view.table, view.display, entry.emitter.capacity) })
            .dispatch(Math.ceil(entry.emitter.capacity / 64));
        }
      }
      const retainedEmitterKeys = new Set(effectEntries
        .filter((entry) => entry.emitter.hasAnimationDemand(time))
        .map((entry) => `${entry.layerId}\0${entry.effectId}`));
      effectTransitions = advanceEffectTransitions(effectTransitions, delta, retainedEmitterKeys);
      const activeTransitionKeys = new Set(effectTransitions.entries
        .filter((transition) => {
          const entry = effectEntries.find((candidate) => candidate.layerId === transition.layerId && candidate.effectId === transition.effect.id);
          return transition.target > 0 || Boolean(entry?.emitter.hasAnimationDemand(time));
        })
        .map((entry) => `${entry.layerId}\0${entry.effect.id}`));
      const retiringEntries = effectEntries.filter((entry) => !activeTransitionKeys.has(`${entry.layerId}\0${entry.effectId}`));
      const nextRadianceKeys = new Map<string, string>();
      for (const entry of assetEntries) {
        const asset = snapshot.scene.assets.find((candidate) => candidate.id === entry.id);
        if (asset) entry.drawable.set({ params: assetParams(asset) });
      }
      for (const entry of fogEntries) {
        const layer = snapshot.scene.layers.find((candidate) => candidate.id === entry.layerId);
        if (layer?.type !== "fog") continue;
        const nextRadianceKey = radianceKey(layer);
        nextRadianceKeys.set(entry.layerId, nextRadianceKey);
        if (entry.radianceKey !== nextRadianceKey && layer.lightSources.length > 0) {
          entry.lightStorage.write(radianceLightData(layer.lightSources));
        }
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
            shadow_sample_count: plan.showEditorGrid ? 2 : 4,
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
      const currentOperations = new Map(compileSceneLayerOperations(snapshot.scene).map((operation) => [operation.layerId, operation]));
      const operations: SceneLayerOperation[] = [];
      for (const layerId of effectTransitions.layerOrder) {
        const current = currentOperations.get(layerId);
        const transitions = effectTransitions.entries.filter((transition) => {
          if (transition.layerId !== layerId) return false;
          const entry = effectEntries.find((candidate) => candidate.layerId === layerId && candidate.effectId === transition.effect.id);
          return transition.target > 0 || Boolean(entry?.emitter.hasAnimationDemand(time));
        });
        if (current?.type !== "effects" && current) {
          operations.push(current);
          continue;
        }
        if (transitions.length === 0) continue;
        const transitionIds = new Set(transitions.map((entry) => entry.effect.id));
        const effectIds = (effectTransitions.effectOrder.get(layerId) ?? []).filter((effectId) => transitionIds.has(effectId));
        operations.push({ type: "effects", layerId, effectIds });
      }
      const refreshedRadiance: FogDrawEntry[] = [];
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
          if (operation.type === "effects") {
            sceneCopy.set({ scene: activeScene });
            currentFrame.pass({ target: alternateScene, clear: [0, 0, 0, 1] }, (pass) => {
              pass.draw(sceneCopy);
              for (const effectId of operation.effectIds) {
                const transition = effectTransitions.entries.find((entry) => entry.layerId === operation.layerId && entry.effect.id === effectId);
                if (!transition) continue;
                const entry = effectEntries.find((candidate) => candidate.layerId === operation.layerId && candidate.effectId === effectId);
                if (!entry?.drawable) continue;
                entry.drawable.set({ params: particleEffectParams(
                  transition.effect,
                  time,
                  entry.emitterMin,
                  entry.emitterMax,
                  entry.polygonVertexCount,
                ) });
                pass.draw(entry.drawable);
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
          const hasIndirect = Boolean(entry?.lightEffects.length && entry.wallSegmentCount);
          const refreshRadiance = Boolean(entry && entry.radianceKey !== nextRadianceKeys.get(entry.layerId));
          if (refreshRadiance && entry) {
            refreshedRadiance.push(entry);
            currentFrame.pass({ target: entry.indirectTarget, clear: [0, 0, 0, 0] }, () => undefined);
          }
          if (refreshRadiance && hasIndirect && entry) {
            const lowSpatial = radianceSpatialParams();
            for (let lightIndex = 0; lightIndex < entry.lightEffects.length; lightIndex++) {
              let cascadeRead = radianceCascades[1];
              let cascadeWrite = radianceCascades[0];
              for (let cascade = radiance.cascadeCount - 1; cascade >= 0; cascade--) {
                const cascadeEffect = entry.radianceCascadeEffects[lightIndex][cascade];
                cascadeEffect.set({
                  params: {
                    state: [cascade, cascade < radiance.cascadeCount - 1 ? 1 : 0, 0, 0],
                    field_size: radiance.field,
                    target_to_grid_offset: lowSpatial.target_to_grid_offset,
                    pixels_per_grid: lowSpatial.pixels_per_grid,
                    segment_count: entry.wallSegmentCount,
                    light_count: entry.lightEffects.length,
                    light_index: lightIndex,
                    bounce_gain: WALL_BOUNCE_GAIN,
                  },
                  upper_tex: cascadeRead,
                });
                currentFrame.pass({ target: cascadeWrite, clear: [0, 0, 0, 0] }, cascadeEffect);
                [cascadeRead, cascadeWrite] = [cascadeWrite, cascadeRead];
              }
              const resolveEffect = entry.radianceResolveEffects[lightIndex];
              resolveEffect.set({
                cascade_tex: cascadeRead,
                params: {
                  field_size: radiance.field,
                  target_to_grid_offset: lowSpatial.target_to_grid_offset,
                  pixels_per_grid: lowSpatial.pixels_per_grid,
                  segment_count: entry.wallSegmentCount,
                  light_count: entry.lightEffects.length,
                  light_index: lightIndex,
                },
              });
              currentFrame.pass({ target: entry.indirectTarget, clear: false }, resolveEffect);
            }
          }
          fogComposite.set({
            scene: activeScene,
            light: lightTarget,
            indirect_light: entry?.indirectTarget.colors[0] ?? emptyIndirectLightTarget.colors[0],
            fog_indirect_light: entry?.indirectTarget.colors[1] ?? emptyIndirectLightTarget.colors[1],
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
            for (const entry of effectEntries) {
              const transition = effectTransitions.entries.find((candidate) => candidate.layerId === entry.layerId && candidate.effect.id === entry.effectId);
              if (!transition?.present || !transition.effect.visible) continue;
              const layer = snapshot.scene.layers.find((candidate) => candidate.id === entry.layerId);
              if (layer?.type !== "effects" || !layer.visible) continue;
              const selected = snapshot.selectedEffect?.layerId === entry.layerId && snapshot.selectedEffect.effectId === entry.effectId;
              const cursor = snapshot.effectCursorPoint;
              const lastVertex = transition.effect.vertices.at(-1);
              const drawing = Boolean(snapshot.effectDrawingActive && cursor && lastVertex && cursor.x === lastVertex.x && cursor.y === lastVertex.y);
              entry.guide?.set({ params: { ...spatialParams(), color: drawing ? entry.definition.drawingGuideColor : selected ? entry.definition.selectedGuideColor : entry.definition.guideColor } });
              entry.handles?.set({ params: { ...spatialParams(), color: drawing ? entry.definition.drawingHandleColor : entry.definition.handleColor } });
              if (entry.guide) pass.draw(entry.guide);
              if ((selected || drawing) && entry.handles) pass.draw(entry.handles);
            }
          }
        });
        currentFrame.pass({ target: destination, clear: [0, 0, 0, 1] }, present);
      });
      await submitted.done;
      for (const entry of refreshedRadiance) {
        entry.radianceKey = nextRadianceKeys.get(entry.layerId) ?? "";
      }
      if (previousTransitions !== effectTransitions && retiringEntries.length > 0) {
        effectEntries = effectEntries.filter((entry) => !retiringEntries.includes(entry));
        retiringEntries.flatMap((entry) => entry.geometries).forEach((item) => item.destroy());
        retiringEntries.forEach((entry) => entry.polygonStorage.destroy());
        retiringEntries.forEach((entry) => entry.contextStorage?.destroy());
        retiringEntries.forEach((entry) => entry.emitter.dispose());
      }
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
      updateRadianceLayout(nextSize);
    },
    setGridVisible(visible) {
      gridVisible = visible;
    },
    setTableEditing(editing) {
      tableEditing = editing;
    },
    setSnapshot(nextSnapshot) {
      effectTransitions = reconcileEffectTransitions(effectTransitions, nextSnapshot.scene);
      snapshot = nextSnapshot;
    },
    setView(nextView) {
      view = nextView;
      projection = compileProjection(view, renderSize);
      updateRadianceLayout([renderSize.width, renderSize.height]);
    },
  };
}
