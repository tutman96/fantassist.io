import { createSampleSceneDocument, freezeSceneDocument } from "./scene-document";
import type { AssetCalibration, AssetTransform, FogPolygon, ImageAsset, SceneDocument, SceneEffect, SceneLayer, SceneLight } from "./scene-document";
import { getTableBounds, MAX_TABLE_SCALE, MIN_TABLE_SCALE } from "./table-camera";
import type { DisplayConfiguration, GridBounds, GridPoint, TableCamera } from "./table-camera";

export type EngineListener = () => void;
export type RendererInvalidation = "all" | "editor";
export const GRID_SNAP_THRESHOLD = 0.1;
export type FogPolygonCollection = "fog" | "clear" | "wall";
export interface FogPolygonSelection {
  readonly layerId: string;
  readonly collection: FogPolygonCollection;
  readonly polygonIndex: number;
}
export interface LightSelection { readonly layerId: string; readonly lightIndex: number }
export interface EffectSelection { readonly layerId: string; readonly effectId: string }

export interface EngineSnapshot<TScene> {
  readonly scene: TScene;
  readonly revision: number;
}

export interface SceneEngineSnapshot extends EngineSnapshot<SceneDocument> {
  readonly presentationRevision: number;
  readonly selectedAssetId: string | null;
  readonly selectedFogLayerId: string | null;
  readonly selectedFogPolygon: FogPolygonSelection | null;
  readonly selectedLight: LightSelection | null;
  readonly selectedEffect: EffectSelection | null;
  readonly previewActive: boolean;
  readonly fogDrawingActive: boolean;
  readonly effectDrawingActive: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly invalidation: RendererInvalidation;
  readonly fogCursorPoint: GridPoint | null;
  readonly fogCursorCollection: FogPolygonCollection | null;
  readonly effectCursorPoint: GridPoint | null;
  readonly gridSnapPoint: GridPoint | null;
}

export type SceneCommand =
  | { readonly type: "scene.rename"; readonly name: string }
  | {
      readonly type: "asset.transform";
      readonly assetId: string;
      readonly transform: AssetTransform;
    }
  | { readonly type: "asset.calibration"; readonly assetId: string; readonly calibration: AssetCalibration | null }
  | { readonly type: "asset.insert"; readonly asset: ImageAsset }
  | { readonly type: "asset.remove"; readonly assetId: string }
  | { readonly type: "asset.visibility"; readonly assetId: string; readonly visible: boolean }
  | { readonly type: "layer.insert"; readonly layer: SceneLayer; readonly index?: number }
  | { readonly type: "layer.remove"; readonly layerId: string }
  | { readonly type: "layer.rename"; readonly layerId: string; readonly name: string }
  | { readonly type: "layer.visibility"; readonly layerId: string; readonly visible: boolean }
  | { readonly type: "layer.move"; readonly layerId: string; readonly toIndex: number }
  | {
      readonly type: "fog.polygon.insert";
      readonly layerId: string;
      readonly collection: FogPolygonCollection;
      readonly polygon: FogPolygon;
      readonly index?: number;
    }
  | {
      readonly type: "fog.polygon.update";
      readonly layerId: string;
      readonly collection: FogPolygonCollection;
      readonly polygonIndex: number;
      readonly polygon: FogPolygon;
    }
  | {
      readonly type: "fog.polygon.remove";
      readonly layerId: string;
      readonly collection: FogPolygonCollection;
      readonly polygonIndex: number;
    }
  | {
      readonly type: "fog.walls.update";
      readonly layerId: string;
      readonly polygons: readonly FogPolygon[];
      readonly selectedPolygonIndex?: number;
    }
  | { readonly type: "table.camera"; readonly table: TableCamera }
  | { readonly type: "light.insert"; readonly layerId: string; readonly light: SceneLight; readonly index?: number }
  | { readonly type: "light.update"; readonly layerId: string; readonly lightIndex: number; readonly light: SceneLight }
  | { readonly type: "light.remove"; readonly layerId: string; readonly lightIndex: number }
  | { readonly type: "light.selection.set"; readonly selection: LightSelection | null }
  | { readonly type: "effect.insert"; readonly layerId: string; readonly effect: SceneEffect; readonly index?: number }
  | { readonly type: "effect.update"; readonly layerId: string; readonly effectId: string; readonly effect: SceneEffect }
  | { readonly type: "effect.remove"; readonly layerId: string; readonly effectId: string }
  | { readonly type: "effect.selection.set"; readonly selection: EffectSelection | null }
  | { readonly type: "fog.layer.select"; readonly layerId: string | null }
  | { readonly type: "fog.selection.set"; readonly selection: FogPolygonSelection | null }
  | { readonly type: "selection.set"; readonly assetId: string | null };

export type PreviewCommand = Extract<SceneCommand, {
  readonly type: "asset.transform" | "table.camera" | "fog.polygon.insert" | "fog.polygon.update" | "fog.walls.update" | "light.insert" | "light.update" | "effect.insert" | "effect.update";
}>;
export interface PreviewToken {
  readonly id: number;
}

export type CommandResult =
  | { readonly ok: true; readonly changed: boolean; readonly revision: number }
  | { readonly ok: false; readonly error: string; readonly revision: number };

export interface SceneEngine {
  getSnapshot(): SceneEngineSnapshot;
  getCommittedSnapshot(): EngineSnapshot<SceneDocument>;
  subscribe(listener: EngineListener): () => void;
  dispatch(command: SceneCommand): CommandResult;
  beginPreview(command: PreviewCommand): PreviewToken;
  updatePreview(token: PreviewToken, command: PreviewCommand): void;
  commitPreview(token: PreviewToken): CommandResult;
  cancelPreview(token: PreviewToken): void;
  beginTableDrag(pointGrid: GridPoint): PreviewToken;
  updateTableDrag(token: PreviewToken, pointGrid: GridPoint): void;
  getTableInteractionHandle(
    pointGrid: GridPoint,
    cssPixelsPerGrid: number,
    display: DisplayConfiguration
  ): TableResizeHandle | "move" | null;
  beginTableInteraction(
    pointGrid: GridPoint,
    cssPixelsPerGrid: number,
    display: DisplayConfiguration
  ): PreviewToken | null;
  updateTableInteraction(token: PreviewToken, pointGrid: GridPoint): void;
  beginAssetDrag(pointGrid: GridPoint): PreviewToken | null;
  updateAssetDrag(token: PreviewToken, pointGrid: GridPoint): void;
  beginAssetInteraction(
    pointGrid: GridPoint,
    cssPixelsPerGrid: number,
    options?: { readonly fromCenter?: boolean; readonly preserveAspectRatio?: boolean }
  ): PreviewToken | null;
  getAssetInteractionHandle(pointGrid: GridPoint, cssPixelsPerGrid: number): AssetHandle | null;
  updateAssetInteraction(
    token: PreviewToken,
    pointGrid: GridPoint,
    options?: { readonly fromCenter?: boolean; readonly preserveAspectRatio?: boolean }
  ): void;
  beginFogPolygon(layerId: string, collection: FogPolygonCollection, pointGrid: GridPoint): PreviewToken;
  appendFogPolygonVertex(token: PreviewToken, pointGrid: GridPoint): void;
  updateFogPolygonCursor(token: PreviewToken, pointGrid: GridPoint): void;
  setFogCursor(pointGrid: GridPoint | null, collection: FogPolygonCollection): void;
  commitFogPolygon(token: PreviewToken): CommandResult;
  commitActiveFogPolygon(): CommandResult;
  cancelActivePreview(): void;
  beginFogSelectionInteraction(pointGrid: GridPoint, cssPixelsPerGrid: number): { readonly handled: boolean; readonly token?: PreviewToken };
  updateFogSelectionInteraction(token: PreviewToken, pointGrid: GridPoint): void;
  beginLightDrag(pointGrid: GridPoint, cssPixelsPerGrid: number): PreviewToken | null;
  updateLightDrag(token: PreviewToken, pointGrid: GridPoint): void;
  beginEffect(layerId: string, effect: SceneEffect, pointGrid: GridPoint): PreviewToken;
  appendEffectVertex(token: PreviewToken, pointGrid: GridPoint): void;
  updateEffectCursor(token: PreviewToken, pointGrid: GridPoint): void;
  setEffectCursor(pointGrid: GridPoint | null): void;
  commitEffect(token: PreviewToken): CommandResult;
  commitActiveEffect(): CommandResult;
  beginEffectSelectionInteraction(pointGrid: GridPoint, cssPixelsPerGrid: number): { readonly handled: boolean; readonly token?: PreviewToken };
  updateEffectSelectionInteraction(token: PreviewToken, pointGrid: GridPoint): void;
  undo(): CommandResult;
  redo(): CommandResult;
  replaceCommittedScene(scene: SceneDocument, revision?: number): void;
  dispose(): void;
}

type HistoryEntry =
  | { readonly kind: "scene-rename"; readonly before: string; readonly after: string }
  | { readonly kind: "layer-rename"; readonly layerId: string; readonly before: string; readonly after: string }
  | { readonly kind: "transform"; readonly assetId: string; readonly before: AssetTransform; readonly after: AssetTransform }
  | {
      readonly kind: "calibration";
      readonly assetId: string;
      readonly before: { readonly calibration?: AssetCalibration; readonly transform: AssetTransform };
      readonly after: { readonly calibration?: AssetCalibration; readonly transform: AssetTransform };
    }
  | { readonly kind: "insert"; readonly asset: ImageAsset }
  | { readonly kind: "remove"; readonly asset: ImageAsset; readonly layerIndex: number }
  | { readonly kind: "insert-layer"; readonly layer: SceneLayer; readonly index: number }
  | { readonly kind: "remove-layer"; readonly layer: SceneLayer; readonly assets: readonly ImageAsset[]; readonly index: number }
  | { readonly kind: "asset-visibility"; readonly assetId: string; readonly before: boolean; readonly after: boolean }
  | { readonly kind: "layer-visibility"; readonly layerId: string; readonly before: boolean; readonly after: boolean }
  | { readonly kind: "move-layer"; readonly layerId: string; readonly fromIndex: number; readonly toIndex: number }
  | {
      readonly kind: "fog-polygon";
      readonly layerId: string;
      readonly collection: FogPolygonCollection;
      readonly index: number;
      readonly before?: FogPolygon;
      readonly after?: FogPolygon;
    }
  | {
      readonly kind: "fog-walls";
      readonly layerId: string;
      readonly before: readonly FogPolygon[];
      readonly after: readonly FogPolygon[];
      readonly selectedPolygonIndex?: number;
    }
  | { readonly kind: "table-camera"; readonly before: TableCamera; readonly after: TableCamera }
  | {
      readonly kind: "light";
      readonly layerId: string;
      readonly index: number;
      readonly before?: SceneLight;
      readonly after?: SceneLight;
    }
  | {
      readonly kind: "effect";
      readonly layerId: string;
      readonly effectId: string;
      readonly index: number;
      readonly before?: SceneEffect;
      readonly after?: SceneEffect;
    };

interface ActivePreview {
  readonly token: PreviewToken;
  command: PreviewCommand;
  interaction?: AssetInteraction;
  tableDrag?: { readonly initialPointer: GridPoint; readonly initialOrigin: GridPoint };
  tableResize?: {
    readonly initialPointer: GridPoint;
    readonly initialTable: TableCamera;
    readonly initialBounds: GridBounds;
    readonly handle: TableResizeHandle;
  };
  fogDrawing?: {
    readonly fixedVertices: readonly GridPoint[];
    readonly fixedWallPolygons?: readonly FogPolygon[];
  };
  fogVertex?: { readonly vertexIndex: number; readonly polygonIndex?: number };
  fogMove?: { readonly initialPointer: GridPoint; readonly initialVertices: readonly GridPoint[] };
  fogCursorPoint?: GridPoint;
  gridSnapPoint?: GridPoint;
  lightMove?: { readonly grabOffset: GridPoint };
  effectDrawing?: { readonly fixedVertices: readonly GridPoint[] };
  effectVertex?: { readonly vertexIndex: number };
  effectMove?: { readonly initialPointer: GridPoint; readonly initialVertices: readonly GridPoint[] };
  effectCursorPoint?: GridPoint;
}

export type TableResizeHandle = "north-west" | "north-east" | "south-east" | "south-west";
export type ResizeHandle =
  | "north-west"
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west";
export type AssetHandle = ResizeHandle | "rotate";
type AssetInteraction =
  | { readonly kind: "move"; readonly grabOffset: GridPoint }
  | {
      readonly kind: "resize";
      readonly signX: -1 | 0 | 1;
      readonly signY: -1 | 0 | 1;
      readonly rotation: number;
      readonly supportsAspectRatio: boolean;
      readonly preserveAspectRatio: boolean;
      readonly baselinePointer: GridPoint;
      readonly baselineTransform: AssetTransform;
      readonly fromCenter: boolean;
    }
  | {
      readonly kind: "rotate";
      readonly center: GridPoint;
      readonly startAngle: number;
      readonly initialRotation: number;
    };

export function createSceneEngine(initialScene = createSampleSceneDocument()): SceneEngine {
  let committedScene = freezeSceneDocument(initialScene);
  let revision = committedScene.version;
  let presentationRevision = 0;
  let selectedAssetId: string | null = null;
  let selectedFogLayerId: string | null = null;
  let selectedFogPolygon: FogPolygonSelection | null = null;
  let selectedLight: LightSelection | null = null;
  let selectedEffect: EffectSelection | null = null;
  let hoverFogCursorPoint: GridPoint | null = null;
  let hoverFogCursorCollection: FogPolygonCollection | null = null;
  let hoverEffectCursorPoint: GridPoint | null = null;
  let hoverGridSnapPoint: GridPoint | null = null;
  let preview: ActivePreview | undefined;
  let tokenSequence = 0;
  let disposed = false;
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  const listeners = new Set<EngineListener>();
  let snapshot = buildSnapshot("all");

  function buildSnapshot(invalidation: RendererInvalidation): SceneEngineSnapshot {
    const scene = preview ? applyPreview(committedScene, preview.command, revision) : committedScene;
    return Object.freeze({
      scene,
      revision,
      presentationRevision,
      selectedAssetId,
      selectedFogLayerId,
      selectedFogPolygon,
      selectedLight,
      selectedEffect,
      previewActive: preview !== undefined,
      fogDrawingActive: preview?.fogDrawing !== undefined,
      effectDrawingActive: preview?.effectDrawing !== undefined,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      invalidation,
      fogCursorPoint: preview ? preview.fogCursorPoint ?? null : hoverFogCursorPoint,
      fogCursorCollection: preview
        ? preview.fogCursorPoint && (preview.command.type === "fog.polygon.insert" || preview.command.type === "fog.polygon.update" || preview.command.type === "fog.walls.update")
          ? preview.command.type === "fog.walls.update" ? "wall" : preview.command.collection
          : null
        : hoverFogCursorCollection,
      effectCursorPoint: preview ? preview.effectCursorPoint ?? null : hoverEffectCursorPoint,
      gridSnapPoint: preview ? preview.gridSnapPoint ?? null : hoverGridSnapPoint,
    });
  }

  function publish(invalidation: RendererInvalidation) {
    if (disposed) return;
    presentationRevision++;
    snapshot = buildSnapshot(invalidation);
    for (const listener of listeners) listener();
  }

  function transformResult(
    command: Extract<PreviewCommand, { readonly type: "asset.transform" }>,
    recordHistory: boolean,
    publishUnchanged = false
  ): CommandResult {
    const asset = findAsset(committedScene, command.assetId);
    const error = validateTransform(command.transform);
    if (!asset) return { ok: false, error: `Unknown asset '${command.assetId}'`, revision };
    if (error) return { ok: false, error, revision };
    if (sameTransform(asset.transform, command.transform)) {
      if (publishUnchanged) publish("all");
      return { ok: true, changed: false, revision };
    }
    if (recordHistory) {
      undoStack = [...undoStack, { kind: "transform", assetId: asset.id, before: asset.transform, after: command.transform }];
      redoStack = [];
    }
    revision++;
    committedScene = applyTransform(committedScene, command, revision);
    publish("all");
    return { ok: true, changed: true, revision };
  }

  function sceneNameResult(name: string, recordHistory: boolean): CommandResult {
    const normalized = normalizeName(name, "Scene");
    if ("error" in normalized) return { ok: false, error: normalized.error, revision };
    if (committedScene.name === normalized.name) return { ok: true, changed: false, revision };
    if (recordHistory) {
      undoStack = [...undoStack, { kind: "scene-rename", before: committedScene.name, after: normalized.name }];
      redoStack = [];
    }
    revision++;
    committedScene = applySceneName(committedScene, normalized.name, revision);
    publish("all");
    return { ok: true, changed: true, revision };
  }

  function layerNameResult(layerId: string, name: string, recordHistory: boolean): CommandResult {
    const layer = committedScene.layers.find((candidate) => candidate.id === layerId);
    if (!layer) return { ok: false, error: `Unknown layer '${layerId}'`, revision };
    const normalized = normalizeName(name, "Layer");
    if ("error" in normalized) return { ok: false, error: normalized.error, revision };
    if (layer.name === normalized.name) return { ok: true, changed: false, revision };
    if (recordHistory) {
      undoStack = [...undoStack, { kind: "layer-rename", layerId, before: layer.name, after: normalized.name }];
      redoStack = [];
    }
    revision++;
    committedScene = applyLayerName(committedScene, layerId, normalized.name, revision);
    publish("all");
    return { ok: true, changed: true, revision };
  }

  function calibrationResult(
    assetId: string,
    calibration: AssetCalibration | undefined,
    transform: AssetTransform,
    recordHistory: boolean
  ): CommandResult {
    const asset = findAsset(committedScene, assetId);
    if (!asset) return { ok: false, error: `Unknown asset '${assetId}'`, revision };
    const error = calibration ? validateCalibration(calibration) ?? validateTransform(transform) : validateTransform(transform);
    if (error) return { ok: false, error, revision };
    if (sameCalibration(asset.calibration, calibration) && sameTransform(asset.transform, transform)) {
      return { ok: true, changed: false, revision };
    }
    if (recordHistory) {
      undoStack = [...undoStack, {
        kind: "calibration",
        assetId,
        before: { ...(asset.calibration ? { calibration: asset.calibration } : {}), transform: asset.transform },
        after: { ...(calibration ? { calibration } : {}), transform },
      }];
      redoStack = [];
    }
    revision++;
    committedScene = applyCalibration(committedScene, assetId, calibration, transform, revision);
    publish("all");
    return { ok: true, changed: true, revision };
  }

  function tableResult(
    command: Extract<PreviewCommand, { readonly type: "table.camera" }>,
    recordHistory: boolean,
    publishUnchanged = false
  ): CommandResult {
    const error = validateTable(command.table);
    if (error) return { ok: false, error, revision };
    const table = freezeTable(command.table);
    if (sameTable(committedScene.table, table)) {
      if (publishUnchanged) publish("all");
      return { ok: true, changed: false, revision };
    }
    if (recordHistory) {
      undoStack = [...undoStack, { kind: "table-camera", before: committedScene.table, after: table }];
      redoStack = [];
    }
    revision++;
    committedScene = applyTable(committedScene, table, revision);
    publish("all");
    return { ok: true, changed: true, revision };
  }

  function fogResult(
    command: Extract<SceneCommand, { readonly type: "fog.polygon.insert" | "fog.polygon.update" | "fog.polygon.remove" }>,
    recordHistory: boolean,
    publishUnchanged = false
  ): CommandResult {
    const layer = committedScene.layers.find((candidate) => candidate.id === command.layerId);
    if (!layer || layer.type !== "fog") {
      return { ok: false, error: `Unknown fog layer '${command.layerId}'`, revision };
    }
    const polygons = fogCollection(layer, command.collection);
    if (command.type === "fog.polygon.insert") {
      const error = validateFogPolygon(command.polygon, command.collection);
      if (error) return { ok: false, error, revision };
      const index = Math.min(polygons.length, Math.max(0, command.index ?? polygons.length));
      if (recordHistory) {
        undoStack = [...undoStack, { kind: "fog-polygon", layerId: layer.id, collection: command.collection, index, after: command.polygon }];
        redoStack = [];
      }
      revision++;
      committedScene = applyFogPolygon(committedScene, layer.id, command.collection, index, command.polygon, revision, true);
      selectedFogLayerId = layer.id;
      selectedFogPolygon = { layerId: layer.id, collection: command.collection, polygonIndex: index };
      selectedAssetId = null;
      selectedLight = null;
      selectedEffect = null;
      publish("all");
      return { ok: true, changed: true, revision };
    }
    if (command.polygonIndex < 0 || command.polygonIndex >= polygons.length) {
      return { ok: false, error: `Unknown fog polygon '${command.polygonIndex}'`, revision };
    }
    const before = polygons[command.polygonIndex];
    if (command.type === "fog.polygon.update") {
      const error = validateFogPolygon(command.polygon, command.collection);
      if (error) return { ok: false, error, revision };
      if (sameFogPolygon(before, command.polygon)) {
        if (publishUnchanged) publish("all");
        return { ok: true, changed: false, revision };
      }
      if (recordHistory) {
        undoStack = [...undoStack, { kind: "fog-polygon", layerId: layer.id, collection: command.collection, index: command.polygonIndex, before, after: command.polygon }];
        redoStack = [];
      }
      revision++;
      committedScene = applyFogPolygon(committedScene, layer.id, command.collection, command.polygonIndex, command.polygon, revision);
      publish("all");
      return { ok: true, changed: true, revision };
    }
    if (recordHistory) {
      undoStack = [...undoStack, { kind: "fog-polygon", layerId: layer.id, collection: command.collection, index: command.polygonIndex, before }];
      redoStack = [];
    }
    revision++;
    committedScene = applyFogPolygon(committedScene, layer.id, command.collection, command.polygonIndex, undefined, revision);
    if (selectedFogPolygon?.layerId === layer.id && selectedFogPolygon.collection === command.collection) {
      selectedFogPolygon = selectedFogPolygon.polygonIndex === command.polygonIndex
        ? null
        : selectedFogPolygon.polygonIndex > command.polygonIndex
          ? { ...selectedFogPolygon, polygonIndex: selectedFogPolygon.polygonIndex - 1 }
          : selectedFogPolygon;
    }
    publish("all");
    return { ok: true, changed: true, revision };
  }

  function wallResult(
    command: Extract<SceneCommand, { readonly type: "fog.walls.update" }>,
    recordHistory: boolean,
    publishUnchanged = false
  ): CommandResult {
    const layer = committedScene.layers.find((candidate) => candidate.id === command.layerId);
    if (!layer || layer.type !== "fog") {
      return { ok: false, error: `Unknown fog layer '${command.layerId}'`, revision };
    }
    const error = command.polygons.map((polygon) => validateFogPolygon(polygon, "wall")).find(Boolean);
    if (error) return { ok: false, error, revision };
    if (sameFogPolygons(layer.obstructionPolygons, command.polygons)) {
      if (publishUnchanged) publish("all");
      return { ok: true, changed: false, revision };
    }
    if (recordHistory) {
      undoStack = [...undoStack, {
        kind: "fog-walls",
        layerId: layer.id,
        before: layer.obstructionPolygons,
        after: command.polygons,
        selectedPolygonIndex: command.selectedPolygonIndex,
      }];
      redoStack = [];
    }
    revision++;
    committedScene = applyWallPolygons(committedScene, layer.id, command.polygons, revision);
    if (command.selectedPolygonIndex !== undefined) {
      selectedFogLayerId = layer.id;
      selectedFogPolygon = { layerId: layer.id, collection: "wall", polygonIndex: command.selectedPolygonIndex };
      selectedAssetId = null;
      selectedLight = null;
      selectedEffect = null;
    } else if (selectedFogPolygon?.layerId === layer.id && selectedFogPolygon.collection === "wall" && selectedFogPolygon.polygonIndex >= command.polygons.length) {
      selectedFogPolygon = null;
    }
    publish("all");
    return { ok: true, changed: true, revision };
  }

  function lightResult(
    command: Extract<SceneCommand, { readonly type: "light.insert" | "light.update" | "light.remove" }>,
    recordHistory: boolean,
    publishUnchanged = false
  ): CommandResult {
    const layer = committedScene.layers.find((candidate) => candidate.id === command.layerId);
    if (!layer || layer.type !== "fog") return { ok: false, error: `Unknown fog layer '${command.layerId}'`, revision };
    if (command.type === "light.insert") {
      const error = validateLight(command.light);
      if (error) return { ok: false, error, revision };
      const index = Math.min(layer.lightSources.length, Math.max(0, command.index ?? layer.lightSources.length));
      if (recordHistory) {
        undoStack = [...undoStack, { kind: "light", layerId: layer.id, index, after: command.light }];
        redoStack = [];
      }
      revision++;
      committedScene = applyLight(committedScene, layer.id, index, command.light, revision, true);
      selectedLight = { layerId: layer.id, lightIndex: index };
      selectedAssetId = null;
      selectedFogPolygon = null;
      selectedFogLayerId = layer.id;
      selectedEffect = null;
      publish("all");
      return { ok: true, changed: true, revision };
    }
    if (command.lightIndex < 0 || command.lightIndex >= layer.lightSources.length) {
      return { ok: false, error: `Unknown light '${command.lightIndex}'`, revision };
    }
    const before = layer.lightSources[command.lightIndex];
    if (command.type === "light.update") {
      const error = validateLight(command.light);
      if (error) return { ok: false, error, revision };
      if (sameLight(before, command.light)) {
        if (publishUnchanged) publish("all");
        return { ok: true, changed: false, revision };
      }
      if (recordHistory) {
        undoStack = [...undoStack, { kind: "light", layerId: layer.id, index: command.lightIndex, before, after: command.light }];
        redoStack = [];
      }
      revision++;
      committedScene = applyLight(committedScene, layer.id, command.lightIndex, command.light, revision);
      publish("all");
      return { ok: true, changed: true, revision };
    }
    if (recordHistory) {
      undoStack = [...undoStack, { kind: "light", layerId: layer.id, index: command.lightIndex, before }];
      redoStack = [];
    }
    revision++;
    committedScene = applyLight(committedScene, layer.id, command.lightIndex, undefined, revision);
    if (selectedLight?.layerId === layer.id) {
      selectedLight = selectedLight.lightIndex === command.lightIndex
        ? null
        : selectedLight.lightIndex > command.lightIndex
          ? { ...selectedLight, lightIndex: selectedLight.lightIndex - 1 }
          : selectedLight;
    }
    publish("all");
    return { ok: true, changed: true, revision };
  }

  function effectResult(
    command: Extract<SceneCommand, { readonly type: "effect.insert" | "effect.update" | "effect.remove" }>,
    recordHistory: boolean,
    publishUnchanged = false
  ): CommandResult {
    const layer = committedScene.layers.find((candidate) => candidate.id === command.layerId);
    if (!layer || layer.type !== "effects") {
      return { ok: false, error: `Unknown effects layer '${command.layerId}'`, revision };
    }
    if (command.type === "effect.insert") {
      const error = validateEffect(command.effect);
      if (error) return { ok: false, error, revision };
      if (findEffect(committedScene, command.effect.id)) {
        return { ok: false, error: `Effect '${command.effect.id}' already exists`, revision };
      }
      const index = Math.min(layer.effects.length, Math.max(0, command.index ?? layer.effects.length));
      if (recordHistory) {
        undoStack = [...undoStack, { kind: "effect", layerId: layer.id, effectId: command.effect.id, index, after: command.effect }];
        redoStack = [];
      }
      revision++;
      committedScene = applyEffect(committedScene, layer.id, index, command.effect, revision, true);
      selectedEffect = Object.freeze({ layerId: layer.id, effectId: command.effect.id });
      selectedAssetId = null;
      selectedFogLayerId = null;
      selectedFogPolygon = null;
      selectedLight = null;
      publish("all");
      return { ok: true, changed: true, revision };
    }
    const index = layer.effects.findIndex((effect) => effect.id === command.effectId);
    if (index < 0) return { ok: false, error: `Unknown effect '${command.effectId}'`, revision };
    const before = layer.effects[index];
    if (command.type === "effect.update") {
      if (command.effect.id !== command.effectId) {
        return { ok: false, error: "Effect ID cannot be changed", revision };
      }
      const error = validateEffect(command.effect);
      if (error) return { ok: false, error, revision };
      if (sameEffect(before, command.effect)) {
        if (publishUnchanged) publish("all");
        return { ok: true, changed: false, revision };
      }
      if (recordHistory) {
        undoStack = [...undoStack, { kind: "effect", layerId: layer.id, effectId: before.id, index, before, after: command.effect }];
        redoStack = [];
      }
      revision++;
      committedScene = applyEffect(committedScene, layer.id, index, command.effect, revision);
      publish("all");
      return { ok: true, changed: true, revision };
    }
    if (recordHistory) {
      undoStack = [...undoStack, { kind: "effect", layerId: layer.id, effectId: before.id, index, before }];
      redoStack = [];
    }
    revision++;
    committedScene = applyEffect(committedScene, layer.id, index, undefined, revision);
    if (selectedEffect?.effectId === before.id) selectedEffect = null;
    publish("all");
    return { ok: true, changed: true, revision };
  }

  const engine: SceneEngine = {
    getSnapshot: () => snapshot,
    getCommittedSnapshot: () => Object.freeze({ scene: committedScene, revision }),
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(command) {
      if (disposed) return { ok: false, error: "Scene engine is disposed", revision };
      if (command.type === "scene.rename") return sceneNameResult(command.name, true);
      if (command.type === "layer.rename") return layerNameResult(command.layerId, command.name, true);
      if (command.type === "asset.transform") return transformResult(command, true);
      if (command.type === "asset.calibration") {
        const asset = findAsset(committedScene, command.assetId);
        if (!asset) return { ok: false, error: `Unknown asset '${command.assetId}'`, revision };
        if (command.calibration === null) {
          return calibrationResult(asset.id, undefined, asset.transform, true);
        }
        const error = validateCalibration(command.calibration);
        if (error) return { ok: false, error, revision };
        return calibrationResult(asset.id, command.calibration, {
          ...asset.transform,
          width: asset.intrinsicSize.width / command.calibration.ppiX,
          height: asset.intrinsicSize.height / command.calibration.ppiY,
        }, true);
      }
      if (command.type === "table.camera") return tableResult(command, true);
      if (
        command.type === "fog.polygon.insert" ||
        command.type === "fog.polygon.update" ||
        command.type === "fog.polygon.remove"
      ) {
        return fogResult(command, true);
      }
      if (command.type === "fog.walls.update") return wallResult(command, true);
      if (command.type === "light.insert" || command.type === "light.update" || command.type === "light.remove") {
        return lightResult(command, true);
      }
      if (command.type === "effect.insert" || command.type === "effect.update" || command.type === "effect.remove") {
        return effectResult(command, true);
      }
      if (command.type === "asset.insert") {
        if (findAsset(committedScene, command.asset.id)) {
          return { ok: false, error: `Asset '${command.asset.id}' already exists`, revision };
        }
        if (!committedScene.layers.some((layer) => layer.id === command.asset.layerId && layer.type === "assets")) {
          return { ok: false, error: `Unknown asset layer '${command.asset.layerId}'`, revision };
        }
        const error = validateTransform(command.asset.transform);
        if (error) return { ok: false, error, revision };
        const calibrationError = command.asset.calibration ? validateCalibration(command.asset.calibration) : null;
        if (calibrationError) return { ok: false, error: calibrationError, revision };
        revision++;
        committedScene = applyInsert(committedScene, command.asset, revision);
        undoStack = [...undoStack, { kind: "insert", asset: command.asset }];
        redoStack = [];
        selectedAssetId = command.asset.id;
        selectedFogLayerId = null;
        selectedFogPolygon = null;
        selectedLight = null;
        selectedEffect = null;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "asset.remove") {
        const asset = findAsset(committedScene, command.assetId);
        if (!asset) return { ok: false, error: `Unknown asset '${command.assetId}'`, revision };
        const layer = committedScene.layers.find((candidate) => candidate.id === asset.layerId);
        const layerIndex = layer?.type === "assets" ? layer.assetIds.indexOf(asset.id) : -1;
        if (layerIndex < 0) return { ok: false, error: `Asset '${asset.id}' is not assigned to its layer`, revision };
        revision++;
        committedScene = applyRemove(committedScene, asset.id, revision);
        undoStack = [...undoStack, { kind: "remove", asset, layerIndex }];
        redoStack = [];
        if (selectedAssetId === asset.id) selectedAssetId = null;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "asset.visibility") {
        const asset = findAsset(committedScene, command.assetId);
        if (!asset) return { ok: false, error: `Unknown asset '${command.assetId}'`, revision };
        if (asset.visible === command.visible) return { ok: true, changed: false, revision };
        revision++;
        committedScene = applyAssetVisibility(committedScene, asset.id, command.visible, revision);
        undoStack = [...undoStack, { kind: "asset-visibility", assetId: asset.id, before: asset.visible, after: command.visible }];
        redoStack = [];
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "layer.insert") {
        if (committedScene.layers.some((layer) => layer.id === command.layer.id)) {
          return { ok: false, error: `Layer '${command.layer.id}' already exists`, revision };
        }
        const nonEmpty = command.layer.type === "assets"
          ? command.layer.assetIds.length > 0
          : command.layer.type === "fog"
            ? command.layer.assetIds.length > 0 || command.layer.fogPolygons.length > 0 || command.layer.fogClearPolygons.length > 0 || command.layer.obstructionPolygons.length > 0 || command.layer.lightSources.length > 0
            : command.layer.effects.length > 0;
        if (nonEmpty) {
          return { ok: false, error: "Only empty layers can be inserted", revision };
        }
        const index = Math.min(
          committedScene.layers.length,
          Math.max(0, command.index ?? committedScene.layers.length)
        );
        revision++;
        committedScene = applyLayerInsert(committedScene, command.layer, index, revision);
        undoStack = [...undoStack, { kind: "insert-layer", layer: command.layer, index }];
        redoStack = [];
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "layer.remove") {
        const index = committedScene.layers.findIndex((layer) => layer.id === command.layerId);
        if (index < 0) return { ok: false, error: `Unknown layer '${command.layerId}'`, revision };
        const layer = committedScene.layers[index];
        const assetIds = layer.type === "effects" ? [] : layer.assetIds;
        const assets = assetIds.flatMap((id) => {
          const asset = findAsset(committedScene, id);
          return asset ? [asset] : [];
        });
        revision++;
        committedScene = applyLayerDelete(committedScene, layer.id, revision);
        undoStack = [...undoStack, { kind: "remove-layer", layer, assets, index }];
        redoStack = [];
        if (selectedAssetId && assetIds.includes(selectedAssetId)) selectedAssetId = null;
        if (selectedFogLayerId === layer.id) selectedFogLayerId = null;
        if (selectedFogPolygon?.layerId === layer.id) selectedFogPolygon = null;
        if (selectedLight?.layerId === layer.id) selectedLight = null;
        if (selectedEffect?.layerId === layer.id) selectedEffect = null;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "layer.visibility") {
        const layer = committedScene.layers.find((candidate) => candidate.id === command.layerId);
        if (!layer) return { ok: false, error: `Unknown layer '${command.layerId}'`, revision };
        if (layer.visible === command.visible) return { ok: true, changed: false, revision };
        revision++;
        committedScene = applyLayerVisibility(committedScene, layer.id, command.visible, revision);
        undoStack = [...undoStack, { kind: "layer-visibility", layerId: layer.id, before: layer.visible, after: command.visible }];
        redoStack = [];
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "layer.move") {
        const fromIndex = committedScene.layers.findIndex((layer) => layer.id === command.layerId);
        if (fromIndex < 0) return { ok: false, error: `Unknown layer '${command.layerId}'`, revision };
        const toIndex = Math.min(committedScene.layers.length - 1, Math.max(0, command.toIndex));
        if (fromIndex === toIndex) return { ok: true, changed: false, revision };
        revision++;
        committedScene = applyLayerMove(committedScene, fromIndex, toIndex, revision);
        undoStack = [...undoStack, { kind: "move-layer", layerId: command.layerId, fromIndex, toIndex }];
        redoStack = [];
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "fog.layer.select") {
        if (command.layerId !== null && !committedScene.layers.some((layer) => layer.id === command.layerId && layer.type === "fog")) {
          return { ok: false, error: `Unknown fog layer '${command.layerId}'`, revision };
        }
        if (selectedFogLayerId === command.layerId && selectedAssetId === null && selectedFogPolygon === null && selectedLight === null) return { ok: true, changed: false, revision };
        selectedFogLayerId = command.layerId;
        selectedFogPolygon = null;
        selectedAssetId = null;
        selectedLight = null;
        selectedEffect = null;
        publish("editor");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "fog.selection.set") {
        if (command.selection) {
          const layer = committedScene.layers.find((candidate) => candidate.id === command.selection?.layerId);
          const polygon = layer?.type === "fog"
            ? fogCollection(layer, command.selection.collection)[command.selection.polygonIndex]
            : undefined;
          if (!polygon) return { ok: false, error: "Unknown fog polygon selection", revision };
        }
        if (sameFogSelection(selectedFogPolygon, command.selection) && selectedAssetId === null && selectedLight === null) {
          return { ok: true, changed: false, revision };
        }
        selectedFogPolygon = command.selection;
        selectedFogLayerId = command.selection?.layerId ?? selectedFogLayerId;
        selectedAssetId = null;
        selectedLight = null;
        selectedEffect = null;
        publish("editor");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "light.selection.set") {
        if (command.selection) {
          const layer = committedScene.layers.find((candidate) => candidate.id === command.selection?.layerId);
          if (layer?.type !== "fog" || !layer.lightSources[command.selection.lightIndex]) {
            return { ok: false, error: "Unknown light selection", revision };
          }
        }
        if (sameLightSelection(selectedLight, command.selection) && selectedAssetId === null && selectedFogPolygon === null) {
          return { ok: true, changed: false, revision };
        }
        selectedLight = command.selection;
        selectedFogLayerId = command.selection?.layerId ?? selectedFogLayerId;
        selectedAssetId = null;
        selectedFogPolygon = null;
        selectedEffect = null;
        publish("editor");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "effect.selection.set") {
        if (command.selection) {
          const effect = effectBySelection(committedScene, command.selection);
          if (!effect) return { ok: false, error: "Unknown effect selection", revision };
        }
        if (sameEffectSelection(selectedEffect, command.selection) && selectedAssetId === null && selectedFogPolygon === null && selectedLight === null) {
          return { ok: true, changed: false, revision };
        }
        selectedEffect = command.selection ? Object.freeze({ ...command.selection }) : null;
        selectedAssetId = null;
        selectedFogLayerId = null;
        selectedFogPolygon = null;
        selectedLight = null;
        publish("editor");
        return { ok: true, changed: true, revision };
      }
      if (command.assetId !== null && !findAsset(committedScene, command.assetId)) {
        return { ok: false, error: `Unknown asset '${command.assetId}'`, revision };
      }
      if (selectedAssetId === command.assetId && selectedFogPolygon === null && selectedLight === null) {
        return { ok: true, changed: false, revision };
      }
      selectedAssetId = command.assetId;
      if (command.assetId !== null) selectedFogLayerId = null;
      selectedFogPolygon = null;
      selectedLight = null;
      selectedEffect = null;
      publish("editor");
      return { ok: true, changed: true, revision };
    },
    beginPreview(command) {
      if (disposed) throw new Error("Scene engine is disposed");
      if (preview) throw new Error("A scene preview is already active");
      const error = command.type === "asset.transform"
        ? validateTransform(command.transform)
        : command.type === "table.camera"
          ? validateTable(command.table)
          : command.type === "light.insert" || command.type === "light.update"
            ? validateLight(command.light)
            : command.type === "effect.insert" || command.type === "effect.update"
              ? validateEffect(command.effect, true)
            : command.type === "fog.walls.update"
              ? command.polygons.map((polygon) => validateFogPolygon(polygon, "wall", true)).find(Boolean) ?? null
              : validateFogPolygon(command.polygon, command.collection, true);
      if (command.type === "asset.transform" && !findAsset(committedScene, command.assetId)) {
        throw new Error(`Unknown asset '${command.assetId}'`);
      }
      if (command.type === "light.insert" || command.type === "light.update") {
        const layer = committedScene.layers.find((candidate) => candidate.id === command.layerId);
        if (layer?.type !== "fog" || (command.type === "light.update" && !layer.lightSources[command.lightIndex])) throw new Error("Unknown light");
      }
      if (command.type === "effect.insert" || command.type === "effect.update") {
        const layer = committedScene.layers.find((candidate) => candidate.id === command.layerId);
        if (layer?.type !== "effects") throw new Error("Unknown effects layer");
        if (command.type === "effect.insert") {
          if (findEffect(committedScene, command.effect.id)) throw new Error(`Effect '${command.effect.id}' already exists`);
        } else if (command.effect.id !== command.effectId || !layer.effects.some((effect) => effect.id === command.effectId)) {
          throw new Error("Unknown effect");
        }
      }
      if (error) throw new Error(error);
      const token = Object.freeze({ id: ++tokenSequence });
      preview = {
        token,
        command: command.type === "table.camera"
          ? { type: "table.camera", table: freezeTable(command.table) }
          : command,
      };
      publish("editor");
      return token;
    },
    updatePreview(token, command) {
      if (!preview || preview.token.id !== token.id) return;
      if (preview.command.type !== command.type) return;
      if (command.type === "asset.transform") {
        if (preview.command.type !== "asset.transform" || preview.command.assetId !== command.assetId || validateTransform(command.transform)) return;
        preview.command = command;
      } else if (command.type === "table.camera") {
        if (validateTable(command.table)) return;
        preview.command = { type: "table.camera", table: freezeTable(command.table) };
      } else if (command.type === "light.insert" || command.type === "light.update") {
        if (preview.command.type !== command.type || preview.command.layerId !== command.layerId || validateLight(command.light)) return;
        if (command.type === "light.update" && (preview.command.type !== "light.update" || preview.command.lightIndex !== command.lightIndex)) return;
        preview.command = command;
      } else if (command.type === "effect.insert" || command.type === "effect.update") {
        if (
          preview.command.type !== command.type ||
          preview.command.layerId !== command.layerId ||
          validateEffect(command.effect, true) ||
          preview.command.effect.id !== command.effect.id ||
          (command.type === "effect.update" && (preview.command.type !== "effect.update" || preview.command.effectId !== command.effectId || command.effect.id !== command.effectId))
        ) return;
        preview.command = command;
      } else if (command.type === "fog.walls.update") {
        if (
          preview.command.type !== "fog.walls.update" ||
          preview.command.layerId !== command.layerId ||
          command.polygons.some((polygon) => validateFogPolygon(polygon, "wall", true))
        ) return;
        preview.command = command;
      } else {
        if (validateFogPolygon(command.polygon, command.collection, true)) return;
        preview.command = command;
      }
      publish("editor");
    },
    commitPreview(token) {
      if (!preview || preview.token.id !== token.id) {
        return { ok: false, error: "Unknown preview token", revision };
      }
      const command = preview.command;
      preview = undefined;
      if (command.type === "asset.transform") return transformResult(command, true, true);
      if (command.type === "table.camera") return tableResult(command, true, true);
      if (command.type === "light.insert" || command.type === "light.update") return lightResult(command, true, true);
      if (command.type === "effect.insert" || command.type === "effect.update") return effectResult(command, true, true);
      if (command.type === "fog.walls.update") return wallResult(command, true, true);
      return fogResult(command, true, true);
    },
    cancelPreview(token) {
      if (!preview || preview.token.id !== token.id) return;
      preview = undefined;
      publish("editor");
    },
    beginTableDrag(pointGrid) {
      if (!Number.isFinite(pointGrid.x) || !Number.isFinite(pointGrid.y)) {
        throw new Error("Table drag points must contain finite numbers");
      }
      const table = committedScene.table;
      const token = engine.beginPreview({ type: "table.camera", table });
      if (preview) {
        preview = {
          ...preview,
          tableDrag: {
            initialPointer: Object.freeze({ ...pointGrid }),
            initialOrigin: Object.freeze({ ...table.originGrid }),
          },
        };
      }
      return token;
    },
    updateTableDrag(token, pointGrid) {
      if (
        !preview ||
        preview.token.id !== token.id ||
        preview.command.type !== "table.camera" ||
        !preview.tableDrag ||
        !Number.isFinite(pointGrid.x) ||
        !Number.isFinite(pointGrid.y)
      ) return;
      const { initialPointer, initialOrigin } = preview.tableDrag;
      engine.updatePreview(token, {
        type: "table.camera",
        table: {
          ...preview.command.table,
          originGrid: {
            x: initialOrigin.x + pointGrid.x - initialPointer.x,
            y: initialOrigin.y + pointGrid.y - initialPointer.y,
          },
        },
      });
    },
    getTableInteractionHandle(pointGrid, cssPixelsPerGrid, display) {
      return pickTableInteractionHandle(snapshot.scene.table, pointGrid, cssPixelsPerGrid, display);
    },
    beginTableInteraction(pointGrid, cssPixelsPerGrid, display) {
      const table = committedScene.table;
      const handle = pickTableInteractionHandle(table, pointGrid, cssPixelsPerGrid, display);
      if (!handle) return null;
      if (handle === "move") return engine.beginTableDrag(pointGrid);
      const initialBounds = getTableBounds(table, display);
      const token = engine.beginPreview({ type: "table.camera", table });
      if (preview) {
        preview = {
          ...preview,
          tableResize: {
            initialPointer: Object.freeze({ ...pointGrid }),
            initialTable: table,
            initialBounds: Object.freeze({ ...initialBounds }),
            handle,
          },
        };
      }
      return token;
    },
    updateTableInteraction(token, pointGrid) {
      if (!preview || preview.token.id !== token.id || !preview.tableResize) {
        engine.updateTableDrag(token, pointGrid);
        return;
      }
      if (preview.command.type !== "table.camera" || !isFinitePoint(pointGrid)) return;
      const { initialPointer, initialTable, initialBounds, handle } = preview.tableResize;
      const draggedCorner = tableCorner(initialBounds, handle);
      const oppositeCorner = tableCorner(initialBounds, oppositeTableHandle(handle));
      const diagonal = {
        x: draggedCorner.x - oppositeCorner.x,
        y: draggedCorner.y - oppositeCorner.y,
      };
      const effectiveCorner = {
        x: draggedCorner.x + pointGrid.x - initialPointer.x,
        y: draggedCorner.y + pointGrid.y - initialPointer.y,
      };
      const diagonalLengthSquared = diagonal.x * diagonal.x + diagonal.y * diagonal.y;
      const sizeFactor = (
        (effectiveCorner.x - oppositeCorner.x) * diagonal.x +
        (effectiveCorner.y - oppositeCorner.y) * diagonal.y
      ) / diagonalLengthSquared;
      const requestedScale = sizeFactor > 0 ? initialTable.scale / sizeFactor : MAX_TABLE_SCALE;
      const scale = Math.min(MAX_TABLE_SCALE, Math.max(MIN_TABLE_SCALE, requestedScale));
      const clampedSizeFactor = initialTable.scale / scale;
      const corner = {
        x: oppositeCorner.x + diagonal.x * clampedSizeFactor,
        y: oppositeCorner.y + diagonal.y * clampedSizeFactor,
      };
      engine.updatePreview(token, {
        type: "table.camera",
        table: {
          ...initialTable,
          scale,
          originGrid: {
            x: handle.endsWith("west") ? corner.x : oppositeCorner.x,
            y: handle.startsWith("north") ? corner.y : oppositeCorner.y,
          },
        },
      });
    },
    beginAssetDrag(pointGrid) {
      const asset = pickImageAsset(committedScene, pointGrid);
      engine.dispatch({ type: "selection.set", assetId: asset?.id ?? null });
      if (!asset) return null;
      return beginAssetPreview(asset, {
        kind: "move",
        grabOffset: { x: pointGrid.x - asset.transform.x, y: pointGrid.y - asset.transform.y },
      });
    },
    updateAssetDrag(token, pointGrid) {
      updateAssetInteraction(token, pointGrid);
    },
    beginAssetInteraction(pointGrid, cssPixelsPerGrid, options) {
      const selectedAsset = selectedAssetId ? findAsset(committedScene, selectedAssetId) : undefined;
      const handle = selectedAsset
        ? pickAssetHandle(selectedAsset.transform, pointGrid, cssPixelsPerGrid)
        : null;
      if (selectedAsset && handle) {
        const transform = selectedAsset.transform;
        const center = transformCenter(transform);
        if (handle === "rotate") {
          return beginAssetPreview(selectedAsset, {
            kind: "rotate",
            center,
            startAngle: Math.atan2(pointGrid.y - center.y, pointGrid.x - center.x),
            initialRotation: transform.rotation,
          });
        }
        const [signX, signY] = resizeHandleSigns(handle);
        return beginAssetPreview(selectedAsset, {
          kind: "resize",
          signX,
          signY,
          rotation: transform.rotation,
          supportsAspectRatio: signX !== 0 && signY !== 0,
          preserveAspectRatio:
            signX !== 0 && signY !== 0 && (options?.preserveAspectRatio ?? false),
          baselinePointer: pointGrid,
          baselineTransform: transform,
          fromCenter: options?.fromCenter ?? false,
        });
      }
      return engine.beginAssetDrag(pointGrid);
    },
    getAssetInteractionHandle(pointGrid, cssPixelsPerGrid) {
      const selectedAsset = selectedAssetId ? findAsset(snapshot.scene, selectedAssetId) : undefined;
      return selectedAsset
        ? pickAssetHandle(selectedAsset.transform, pointGrid, cssPixelsPerGrid)
        : null;
    },
    updateAssetInteraction(token, pointGrid, options) {
      updateAssetInteraction(
        token,
        pointGrid,
        options?.fromCenter ?? false,
        options?.preserveAspectRatio ?? false
      );
    },
    beginFogPolygon(layerId, collection, pointGrid) {
      if (!isFinitePoint(pointGrid)) throw new Error("Fog vertices must contain finite numbers");
      const layer = committedScene.layers.find((candidate) => candidate.id === layerId);
      if (!layer || layer.type !== "fog") throw new Error(`Unknown fog layer '${layerId}'`);
      hoverFogCursorPoint = null;
      hoverFogCursorCollection = null;
      hoverGridSnapPoint = null;
      const wallSnap = collection === "wall"
        ? snapWallOrGrid(layer, layer.obstructionPolygons, pointGrid, undefined, committedScene.table.displayGrid)
        : null;
      const snapped = wallSnap?.point ?? (committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid);
      const polygon = { vertices: [snapped, snapped], visibleOnTable: true };
      const token = collection === "wall"
        ? engine.beginPreview({
            type: "fog.walls.update",
            layerId,
            polygons: [...(wallSnap?.polygons ?? layer.obstructionPolygons), polygon],
            selectedPolygonIndex: layer.obstructionPolygons.length,
          })
        : engine.beginPreview({ type: "fog.polygon.insert", layerId, collection, polygon });
      if (preview) preview = {
        ...preview,
        fogDrawing: {
          fixedVertices: [Object.freeze({ ...snapped })],
          ...(wallSnap ? { fixedWallPolygons: wallSnap.polygons } : {}),
        },
        fogCursorPoint: Object.freeze({ ...snapped }),
        gridSnapPoint: wallSnap?.snapped || snapped !== pointGrid ? Object.freeze({ ...snapped }) : undefined,
      };
      publish("editor");
      return token;
    },
    appendFogPolygonVertex(token, pointGrid) {
      if (!preview || preview.token.id !== token.id || !preview.fogDrawing || !isFinitePoint(pointGrid)) return;
      const command = preview.command;
      if (command.type !== "fog.polygon.insert" && command.type !== "fog.walls.update") return;
      const wallSnap = command.type === "fog.walls.update" && preview.fogDrawing.fixedWallPolygons
        ? snapWallOrGrid(
            fogLayerById(committedScene, command.layerId),
            preview.fogDrawing.fixedWallPolygons,
            pointGrid,
            undefined,
            committedScene.table.displayGrid
          )
        : null;
      const snapped = wallSnap?.point ?? (committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid);
      const previous = preview.fogDrawing.fixedVertices.at(-1);
      const fixedVertices = previous && samePoint(previous, snapped)
        ? preview.fogDrawing.fixedVertices
        : [...preview.fogDrawing.fixedVertices, Object.freeze({ ...snapped })];
      preview.fogDrawing = {
        fixedVertices,
        ...(wallSnap ? { fixedWallPolygons: wallSnap.polygons } : {}),
      };
      preview.fogCursorPoint = Object.freeze({ ...snapped });
      preview.gridSnapPoint = wallSnap?.snapped || snapped !== pointGrid ? Object.freeze({ ...snapped }) : undefined;
      if (command.type === "fog.walls.update") {
        const source = command.polygons.at(-1);
        if (!source || !wallSnap) return;
        engine.updatePreview(token, {
          ...command,
          polygons: [...wallSnap.polygons, { ...source, vertices: [...fixedVertices, snapped] }],
        });
      } else {
        engine.updatePreview(token, { ...command, polygon: { ...command.polygon, vertices: [...fixedVertices, snapped] } });
      }
    },
    updateFogPolygonCursor(token, pointGrid) {
      if (!preview || preview.token.id !== token.id || !preview.fogDrawing || !isFinitePoint(pointGrid)) return;
      const command = preview.command;
      if (command.type !== "fog.polygon.insert" && command.type !== "fog.walls.update") return;
      const wallSnap = command.type === "fog.walls.update" && preview.fogDrawing.fixedWallPolygons
        ? snapWallOrGrid(
            fogLayerById(committedScene, command.layerId),
            preview.fogDrawing.fixedWallPolygons,
            pointGrid,
            undefined,
            committedScene.table.displayGrid
          )
        : null;
      const snapped = wallSnap?.point ?? (committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid);
      preview.fogCursorPoint = Object.freeze({ ...snapped });
      preview.gridSnapPoint = wallSnap?.snapped || snapped !== pointGrid ? Object.freeze({ ...snapped }) : undefined;
      if (command.type === "fog.walls.update") {
        const source = command.polygons.at(-1);
        if (!source || !wallSnap) return;
        engine.updatePreview(token, {
          ...command,
          polygons: [...wallSnap.polygons, { ...source, vertices: [...preview.fogDrawing.fixedVertices, snapped] }],
        });
      } else {
        engine.updatePreview(token, {
          ...command,
          polygon: { ...command.polygon, vertices: [...preview.fogDrawing.fixedVertices, snapped] },
        });
      }
    },
    setFogCursor(pointGrid, collection) {
      if (disposed || preview) return;
      const layer = collection === "wall" && selectedFogLayerId
        ? fogLayerById(committedScene, selectedFogLayerId)
        : undefined;
      const wallSnap = pointGrid && layer
        ? snapWallOrGrid(layer, layer.obstructionPolygons, pointGrid, undefined, committedScene.table.displayGrid)
        : null;
      const snapped = wallSnap?.point ?? (pointGrid && committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid);
      const nextPoint = snapped ? Object.freeze({ ...snapped }) : null;
      const nextCollection = nextPoint ? collection : null;
      const nextSnapPoint = snapped && pointGrid && (wallSnap?.snapped || snapped !== pointGrid) ? nextPoint : null;
      if (
        sameOptionalPoint(hoverFogCursorPoint, nextPoint) &&
        hoverFogCursorCollection === nextCollection &&
        sameOptionalPoint(hoverGridSnapPoint, nextSnapPoint)
      ) return;
      hoverFogCursorPoint = nextPoint;
      hoverFogCursorCollection = nextCollection;
      hoverGridSnapPoint = nextSnapPoint;
      publish("editor");
    },
    setEffectCursor(pointGrid) {
      if (disposed || preview) return;
      const snapped = pointGrid && committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid;
      const nextPoint = snapped ? Object.freeze({ ...snapped }) : null;
      const nextSnapPoint = snapped && pointGrid && snapped !== pointGrid ? nextPoint : null;
      if (sameOptionalPoint(hoverEffectCursorPoint, nextPoint) && sameOptionalPoint(hoverGridSnapPoint, nextSnapPoint)) return;
      hoverEffectCursorPoint = nextPoint;
      hoverGridSnapPoint = nextSnapPoint;
      publish("editor");
    },
    commitFogPolygon(token) {
      if (!preview || preview.token.id !== token.id || !preview.fogDrawing || (preview.command.type !== "fog.polygon.insert" && preview.command.type !== "fog.walls.update")) {
        return { ok: false, error: "Unknown preview token", revision };
      }
      const vertices = dedupeClosingVertex(preview.fogDrawing.fixedVertices);
      if (preview.command.type === "fog.walls.update") {
        const source = preview.command.polygons.at(-1);
        if (!source || !preview.fogDrawing.fixedWallPolygons) {
          return { ok: false, error: "Invalid wall preview", revision };
        }
        preview.command = {
          ...preview.command,
          polygons: [...preview.fogDrawing.fixedWallPolygons, { ...source, vertices }],
        };
      } else {
        preview.command = { ...preview.command, polygon: { ...preview.command.polygon, vertices } };
      }
      return engine.commitPreview(token);
    },
    commitActiveFogPolygon() {
      return preview?.fogDrawing
        ? engine.commitFogPolygon(preview.token)
        : { ok: false, error: "No fog polygon is being drawn", revision };
    },
    cancelActivePreview() {
      if (preview) engine.cancelPreview(preview.token);
    },
    beginFogSelectionInteraction(pointGrid, cssPixelsPerGrid) {
      if (!isFinitePoint(pointGrid) || !Number.isFinite(cssPixelsPerGrid) || cssPixelsPerGrid <= 0) {
        return { handled: false };
      }
      if (selectedFogPolygon) {
        const polygon = selectedFogPolygonValue(committedScene, selectedFogPolygon);
        const vertexIndex = polygon ? pickFogVertex(polygon, pointGrid, cssPixelsPerGrid) : -1;
        if (polygon && vertexIndex >= 0) {
          const token = selectedFogPolygon.collection === "wall"
            ? engine.beginPreview({
                type: "fog.walls.update",
                layerId: selectedFogPolygon.layerId,
                polygons: fogCollectionById(committedScene, selectedFogPolygon.layerId, "wall"),
                selectedPolygonIndex: selectedFogPolygon.polygonIndex,
              })
            : engine.beginPreview({ type: "fog.polygon.update", ...selectedFogPolygon, polygon });
          if (preview) preview = {
            ...preview,
            fogVertex: { vertexIndex, polygonIndex: selectedFogPolygon.polygonIndex },
            fogCursorPoint: Object.freeze({ ...polygon.vertices[vertexIndex] }),
          };
          publish("editor");
          return { handled: true, token };
        }
        const polygonMoveHit = polygon && (selectedFogPolygon.collection === "wall"
          ? pointNearPolyline(pointGrid, polygon.vertices, 8 / cssPixelsPerGrid)
          : pointInPolygon(pointGrid, polygon.vertices));
        if (polygon && polygonMoveHit) {
          const token = engine.beginPreview({
            type: "fog.polygon.update",
            ...selectedFogPolygon,
            polygon,
          });
          if (preview) {
            preview = {
              ...preview,
              fogMove: {
                initialPointer: Object.freeze({ ...pointGrid }),
                initialVertices: Object.freeze(polygon.vertices.map((vertex) => Object.freeze({ ...vertex }))),
              },
            };
          }
          return { handled: true, token };
        }
      }
      const selection = pickFogPolygonEdge(committedScene, pointGrid, cssPixelsPerGrid);
      if (!selection) {
        if (selectedFogPolygon) engine.dispatch({ type: "fog.selection.set", selection: null });
        return { handled: false };
      }
      engine.dispatch({ type: "fog.selection.set", selection });
      return { handled: true };
    },
    updateFogSelectionInteraction(token, pointGrid) {
      if (!preview || preview.token.id !== token.id || (preview.command.type !== "fog.polygon.update" && preview.command.type !== "fog.walls.update") || !isFinitePoint(pointGrid)) return;
      let vertices: GridPoint[];
      if (preview.fogVertex) {
        if (preview.command.type === "fog.walls.update") {
          const layer = fogLayerById(committedScene, preview.command.layerId);
          const polygonIndex = preview.fogVertex.polygonIndex;
          if (!layer || polygonIndex === undefined) return;
          const wallSnap = snapWallOrGrid(
            layer,
            layer.obstructionPolygons,
            pointGrid,
            polygonIndex,
            committedScene.table.displayGrid
          );
          const source = layer.obstructionPolygons[polygonIndex];
          if (!source) return;
          vertices = [...source.vertices];
          vertices[preview.fogVertex.vertexIndex] = wallSnap.point;
          const polygons = [...wallSnap.polygons];
          polygons[polygonIndex] = { ...source, vertices };
          preview.fogCursorPoint = Object.freeze({ ...wallSnap.point });
          preview.gridSnapPoint = wallSnap.snapped ? Object.freeze({ ...wallSnap.point }) : undefined;
          engine.updatePreview(token, { ...preview.command, polygons });
          return;
        }
        const snapped = committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid;
        vertices = [...preview.command.polygon.vertices];
        vertices[preview.fogVertex.vertexIndex] = snapped;
        preview.fogCursorPoint = Object.freeze({ ...snapped });
        preview.gridSnapPoint = snapped === pointGrid ? undefined : Object.freeze({ ...snapped });
      } else if (preview.fogMove) {
        preview.fogCursorPoint = undefined;
        const delta = {
          x: pointGrid.x - preview.fogMove.initialPointer.x,
          y: pointGrid.y - preview.fogMove.initialPointer.y,
        };
        const translated = preview.fogMove.initialVertices.map((vertex) => ({ x: vertex.x + delta.x, y: vertex.y + delta.y }));
        const snapped = committedScene.table.displayGrid
          ? snapFogPolygonTranslation(translated)
          : { vertices: translated, snapPoint: null };
        vertices = [...snapped.vertices];
        preview.gridSnapPoint = snapped.snapPoint ?? undefined;
      } else {
        return;
      }
      if (preview.command.type !== "fog.polygon.update") return;
      engine.updatePreview(token, { ...preview.command, polygon: { ...preview.command.polygon, vertices } });
    },
    beginLightDrag(pointGrid, cssPixelsPerGrid) {
      const selection = pickLight(committedScene, pointGrid, cssPixelsPerGrid);
      if (!selection) return null;
      engine.dispatch({ type: "light.selection.set", selection });
      const layer = committedScene.layers.find((candidate) => candidate.id === selection.layerId);
      if (layer?.type !== "fog") return null;
      const light = layer.lightSources[selection.lightIndex];
      const token = engine.beginPreview({ type: "light.update", ...selection, light });
      if (preview) preview = {
        ...preview,
        lightMove: { grabOffset: { x: pointGrid.x - light.position.x, y: pointGrid.y - light.position.y } },
      };
      return token;
    },
    updateLightDrag(token, pointGrid) {
      if (!preview || preview.token.id !== token.id || preview.command.type !== "light.update" || !preview.lightMove || !isFinitePoint(pointGrid)) return;
      const raw = {
        x: pointGrid.x - preview.lightMove.grabOffset.x,
        y: pointGrid.y - preview.lightMove.grabOffset.y,
      };
      const position = committedScene.table.displayGrid ? snapPointToGrid(raw) : raw;
      preview.gridSnapPoint = position === raw ? undefined : Object.freeze({ ...position });
      engine.updatePreview(token, { ...preview.command, light: { ...preview.command.light, position } });
    },
    beginEffect(layerId, effect, pointGrid) {
      if (!isFinitePoint(pointGrid)) throw new Error("Effect vertices must contain finite numbers");
      const layer = committedScene.layers.find((candidate) => candidate.id === layerId);
      if (layer?.type !== "effects") throw new Error(`Unknown effects layer '${layerId}'`);
      if (effect.vertices.length > 0) throw new Error("A new effect must not contain vertices");
      const baseError = validateEffect(effect, true);
      if (baseError) throw new Error(baseError);
      const snapped = committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid;
      hoverEffectCursorPoint = null;
      hoverGridSnapPoint = null;
      const drawingEffect = { ...effect, vertices: [snapped, snapped] };
      const token = engine.beginPreview({ type: "effect.insert", layerId, effect: drawingEffect });
      if (preview) preview = {
        ...preview,
        effectDrawing: { fixedVertices: [Object.freeze({ ...snapped })] },
        effectCursorPoint: Object.freeze({ ...snapped }),
        gridSnapPoint: snapped === pointGrid ? undefined : Object.freeze({ ...snapped }),
      };
      publish("editor");
      return token;
    },
    appendEffectVertex(token, pointGrid) {
      if (!preview || preview.token.id !== token.id || !preview.effectDrawing || preview.command.type !== "effect.insert" || !isFinitePoint(pointGrid)) return;
      const snapped = committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid;
      const previous = preview.effectDrawing.fixedVertices.at(-1);
      const fixedVertices = previous && samePoint(previous, snapped)
        ? preview.effectDrawing.fixedVertices
        : [...preview.effectDrawing.fixedVertices, Object.freeze({ ...snapped })];
      preview.effectDrawing = { fixedVertices };
      preview.effectCursorPoint = Object.freeze({ ...snapped });
      preview.gridSnapPoint = snapped === pointGrid ? undefined : Object.freeze({ ...snapped });
      engine.updatePreview(token, { ...preview.command, effect: { ...preview.command.effect, vertices: [...fixedVertices, snapped] } });
    },
    updateEffectCursor(token, pointGrid) {
      if (!preview || preview.token.id !== token.id || !preview.effectDrawing || preview.command.type !== "effect.insert" || !isFinitePoint(pointGrid)) return;
      const snapped = committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid;
      preview.effectCursorPoint = Object.freeze({ ...snapped });
      preview.gridSnapPoint = snapped === pointGrid ? undefined : Object.freeze({ ...snapped });
      engine.updatePreview(token, {
        ...preview.command,
        effect: { ...preview.command.effect, vertices: [...preview.effectDrawing.fixedVertices, snapped] },
      });
    },
    commitEffect(token) {
      if (!preview || preview.token.id !== token.id || !preview.effectDrawing || preview.command.type !== "effect.insert") {
        return { ok: false, error: "Unknown preview token", revision };
      }
      preview.command = {
        ...preview.command,
        effect: {
          ...preview.command.effect,
          vertices: effectGeometryKind(preview.command.effect) === "open-path"
            ? preview.effectDrawing.fixedVertices
            : dedupeClosingVertex(preview.effectDrawing.fixedVertices),
        },
      };
      const error = validateEffect(preview.command.effect);
      if (error) return { ok: false, error, revision };
      return engine.commitPreview(token);
    },
    commitActiveEffect() {
      if (!preview?.effectDrawing) return { ok: false, error: "No active effect", revision };
      return engine.commitEffect(preview.token);
    },
    beginEffectSelectionInteraction(pointGrid, cssPixelsPerGrid) {
      if (!isFinitePoint(pointGrid) || !Number.isFinite(cssPixelsPerGrid) || cssPixelsPerGrid <= 0) {
        return { handled: false };
      }
      if (selectedEffect) {
        const layer = committedScene.layers.find((candidate) => candidate.id === selectedEffect?.layerId);
        const effect = layer?.type === "effects" && layer.visible
          ? layer.effects.find((candidate) => candidate.id === selectedEffect?.effectId && candidate.visible)
          : undefined;
        if (effect) {
          const vertexIndex = pickClosedPolygonVertex(effect.vertices, pointGrid, cssPixelsPerGrid);
          if (vertexIndex >= 0) {
            const token = engine.beginPreview({ type: "effect.update", ...selectedEffect, effect });
            if (preview) preview = {
              ...preview,
              effectVertex: { vertexIndex },
              effectCursorPoint: Object.freeze({ ...effect.vertices[vertexIndex] }),
            };
            publish("editor");
            return { handled: true, token };
          }
          const moveHit = effectGeometryKind(effect) === "open-path"
            ? pointNearPolyline(pointGrid, effect.vertices, Math.max(8 / cssPixelsPerGrid, effect.kind === "wall-of-fire" ? effect.width / 2 : 0))
            : pointInPolygon(pointGrid, effect.vertices);
          if (moveHit) {
            const token = engine.beginPreview({ type: "effect.update", ...selectedEffect, effect });
            if (preview) preview = {
              ...preview,
              effectMove: {
                initialPointer: Object.freeze({ ...pointGrid }),
                initialVertices: Object.freeze(effect.vertices.map((vertex) => Object.freeze({ ...vertex }))),
              },
            };
            return { handled: true, token };
          }
        }
      }
      const selection = pickEffectEdge(committedScene, pointGrid, cssPixelsPerGrid);
      if (selection) {
        engine.dispatch({ type: "effect.selection.set", selection });
        return { handled: true };
      }
      if (selectedEffect) engine.dispatch({ type: "effect.selection.set", selection: null });
      return { handled: false };
    },
    updateEffectSelectionInteraction(token, pointGrid) {
      if (!preview || preview.token.id !== token.id || preview.command.type !== "effect.update" || !isFinitePoint(pointGrid)) return;
      let vertices: readonly GridPoint[];
      if (preview.effectVertex) {
        const snapped = committedScene.table.displayGrid ? snapPointToGrid(pointGrid) : pointGrid;
        const nextVertices = [...preview.command.effect.vertices];
        nextVertices[preview.effectVertex.vertexIndex] = snapped;
        vertices = nextVertices;
        preview.effectCursorPoint = Object.freeze({ ...snapped });
        preview.gridSnapPoint = snapped === pointGrid ? undefined : Object.freeze({ ...snapped });
      } else if (preview.effectMove) {
        const delta = {
          x: pointGrid.x - preview.effectMove.initialPointer.x,
          y: pointGrid.y - preview.effectMove.initialPointer.y,
        };
        const translated = preview.effectMove.initialVertices.map((vertex) => ({
          x: vertex.x + delta.x,
          y: vertex.y + delta.y,
        }));
        const snapped = committedScene.table.displayGrid
          ? snapFogPolygonTranslation(translated)
          : { vertices: translated, snapPoint: null };
        vertices = snapped.vertices;
        preview.effectCursorPoint = undefined;
        preview.gridSnapPoint = snapped.snapPoint ?? undefined;
      } else {
        return;
      }
      engine.updatePreview(token, {
        ...preview.command,
        effect: { ...preview.command.effect, vertices },
      });
    },
    undo() {
      if (preview) return { ok: false, error: "Cancel the active preview before undoing", revision };
      const entry = undoStack.at(-1);
      if (!entry) return { ok: true, changed: false, revision };
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, entry];
      if (entry.kind === "insert") {
        revision++;
        committedScene = applyRemove(committedScene, entry.asset.id, revision);
        if (selectedAssetId === entry.asset.id) selectedAssetId = null;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "scene-rename") return sceneNameResult(entry.before, false);
      if (entry.kind === "layer-rename") return layerNameResult(entry.layerId, entry.before, false);
      if (entry.kind === "remove") {
        revision++;
        committedScene = applyInsertAt(committedScene, entry.asset, entry.layerIndex, revision);
        selectedAssetId = entry.asset.id;
        selectedFogLayerId = null;
        selectedFogPolygon = null;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "insert-layer") {
        revision++;
        committedScene = applyLayerRemove(committedScene, entry.layer.id, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "remove-layer") {
        revision++;
        committedScene = applyLayerRestore(committedScene, entry.layer, entry.assets, entry.index, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "asset-visibility") {
        revision++;
        committedScene = applyAssetVisibility(committedScene, entry.assetId, entry.before, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "layer-visibility") {
        revision++;
        committedScene = applyLayerVisibility(committedScene, entry.layerId, entry.before, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "move-layer") {
        revision++;
        committedScene = applyLayerMove(committedScene, entry.toIndex, entry.fromIndex, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "table-camera") {
        return tableResult({ type: "table.camera", table: entry.before }, false);
      }
      if (entry.kind === "fog-polygon") {
        return fogResult(entry.before
          ? entry.after
            ? { type: "fog.polygon.update", layerId: entry.layerId, collection: entry.collection, polygonIndex: entry.index, polygon: entry.before }
            : { type: "fog.polygon.insert", layerId: entry.layerId, collection: entry.collection, index: entry.index, polygon: entry.before }
          : { type: "fog.polygon.remove", layerId: entry.layerId, collection: entry.collection, polygonIndex: entry.index }, false);
      }
      if (entry.kind === "fog-walls") {
        return wallResult({ type: "fog.walls.update", layerId: entry.layerId, polygons: entry.before }, false);
      }
      if (entry.kind === "light") {
        return lightResult(entry.before
          ? entry.after
            ? { type: "light.update", layerId: entry.layerId, lightIndex: entry.index, light: entry.before }
            : { type: "light.insert", layerId: entry.layerId, index: entry.index, light: entry.before }
          : { type: "light.remove", layerId: entry.layerId, lightIndex: entry.index }, false);
      }
      if (entry.kind === "effect") {
        return effectResult(entry.before
          ? entry.after
            ? { type: "effect.update", layerId: entry.layerId, effectId: entry.effectId, effect: entry.before }
            : { type: "effect.insert", layerId: entry.layerId, index: entry.index, effect: entry.before }
          : { type: "effect.remove", layerId: entry.layerId, effectId: entry.effectId }, false);
      }
      if (entry.kind === "calibration") {
        return calibrationResult(entry.assetId, entry.before.calibration, entry.before.transform, false);
      }
      return transformResult(
        { type: "asset.transform", assetId: entry.assetId, transform: entry.before },
        false
      );
    },
    redo() {
      if (preview) return { ok: false, error: "Cancel the active preview before redoing", revision };
      const entry = redoStack.at(-1);
      if (!entry) return { ok: true, changed: false, revision };
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, entry];
      if (entry.kind === "insert") {
        revision++;
        committedScene = applyInsert(committedScene, entry.asset, revision);
        selectedAssetId = entry.asset.id;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "scene-rename") return sceneNameResult(entry.after, false);
      if (entry.kind === "layer-rename") return layerNameResult(entry.layerId, entry.after, false);
      if (entry.kind === "remove") {
        revision++;
        committedScene = applyRemove(committedScene, entry.asset.id, revision);
        if (selectedAssetId === entry.asset.id) selectedAssetId = null;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "insert-layer") {
        revision++;
        committedScene = applyLayerInsert(committedScene, entry.layer, entry.index, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "remove-layer") {
        revision++;
        committedScene = applyLayerDelete(committedScene, entry.layer.id, revision);
        if (selectedAssetId && entry.layer.type !== "effects" && entry.layer.assetIds.includes(selectedAssetId)) selectedAssetId = null;
        if (selectedFogLayerId === entry.layer.id) selectedFogLayerId = null;
        if (selectedFogPolygon?.layerId === entry.layer.id) selectedFogPolygon = null;
        if (selectedLight?.layerId === entry.layer.id) selectedLight = null;
        if (selectedEffect?.layerId === entry.layer.id) selectedEffect = null;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "asset-visibility") {
        revision++;
        committedScene = applyAssetVisibility(committedScene, entry.assetId, entry.after, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "layer-visibility") {
        revision++;
        committedScene = applyLayerVisibility(committedScene, entry.layerId, entry.after, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "move-layer") {
        revision++;
        committedScene = applyLayerMove(committedScene, entry.fromIndex, entry.toIndex, revision);
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (entry.kind === "table-camera") {
        return tableResult({ type: "table.camera", table: entry.after }, false);
      }
      if (entry.kind === "fog-polygon") {
        return fogResult(entry.after
          ? entry.before
            ? { type: "fog.polygon.update", layerId: entry.layerId, collection: entry.collection, polygonIndex: entry.index, polygon: entry.after }
            : { type: "fog.polygon.insert", layerId: entry.layerId, collection: entry.collection, index: entry.index, polygon: entry.after }
          : { type: "fog.polygon.remove", layerId: entry.layerId, collection: entry.collection, polygonIndex: entry.index }, false);
      }
      if (entry.kind === "fog-walls") {
        return wallResult({
          type: "fog.walls.update",
          layerId: entry.layerId,
          polygons: entry.after,
          selectedPolygonIndex: entry.selectedPolygonIndex,
        }, false);
      }
      if (entry.kind === "light") {
        return lightResult(entry.after
          ? entry.before
            ? { type: "light.update", layerId: entry.layerId, lightIndex: entry.index, light: entry.after }
            : { type: "light.insert", layerId: entry.layerId, index: entry.index, light: entry.after }
          : { type: "light.remove", layerId: entry.layerId, lightIndex: entry.index }, false);
      }
      if (entry.kind === "effect") {
        return effectResult(entry.after
          ? entry.before
            ? { type: "effect.update", layerId: entry.layerId, effectId: entry.effectId, effect: entry.after }
            : { type: "effect.insert", layerId: entry.layerId, index: entry.index, effect: entry.after }
          : { type: "effect.remove", layerId: entry.layerId, effectId: entry.effectId }, false);
      }
      if (entry.kind === "calibration") {
        return calibrationResult(entry.assetId, entry.after.calibration, entry.after.transform, false);
      }
      return transformResult(
        { type: "asset.transform", assetId: entry.assetId, transform: entry.after },
        false
      );
    },
    replaceCommittedScene(scene, nextRevision = scene.version) {
      if (disposed || !Number.isInteger(nextRevision) || nextRevision < 0) return;
      committedScene = freezeSceneDocument({ ...scene, version: nextRevision });
      revision = nextRevision;
      selectedAssetId = null;
      selectedFogLayerId = null;
      selectedFogPolygon = null;
      selectedLight = null;
      selectedEffect = null;
      hoverFogCursorPoint = null;
      hoverFogCursorCollection = null;
      hoverGridSnapPoint = null;
      preview = undefined;
      undoStack = [];
      redoStack = [];
      publish("all");
    },
    dispose() {
      disposed = true;
      preview = undefined;
      listeners.clear();
    },
  };

  function beginAssetPreview(asset: ImageAsset, interaction: AssetInteraction): PreviewToken {
    const token = engine.beginPreview({
      type: "asset.transform",
      assetId: asset.id,
      transform: asset.transform,
    });
    if (preview) preview = { ...preview, interaction };
    return token;
  }

  function updateAssetInteraction(
    token: PreviewToken,
    pointGrid: GridPoint,
    fromCenter = false,
    preserveAspectRatio = false
  ) {
    if (
      !preview ||
      preview.token.id !== token.id ||
      preview.command.type !== "asset.transform" ||
      !preview.interaction
    ) return;
    const transform = preview.command.transform;
    const interaction = preview.interaction;
    let nextTransform: AssetTransform;
    if (interaction.kind === "move") {
      nextTransform = {
        ...transform,
        x: pointGrid.x - interaction.grabOffset.x,
        y: pointGrid.y - interaction.grabOffset.y,
      };
      const asset = findAsset(committedScene, preview.command.assetId);
      if (committedScene.table.displayGrid && asset?.calibration) {
        const snapped = snapCalibratedAssetTransform(nextTransform, asset.calibration);
        preview.gridSnapPoint = snapped === nextTransform ? undefined : calibratedAssetGridPoint(snapped, asset.calibration);
        nextTransform = snapped;
      } else {
        preview.gridSnapPoint = undefined;
      }
    } else if (interaction.kind === "rotate") {
      const angle = Math.atan2(
        pointGrid.y - interaction.center.y,
        pointGrid.x - interaction.center.x
      );
      nextTransform = {
        ...transform,
        rotation: applyRotationSnap(
          interaction.initialRotation + ((angle - interaction.startAngle) * 180) / Math.PI
        ),
      };
    } else {
      const nextPreserveAspectRatio = interaction.supportsAspectRatio && preserveAspectRatio;
      if (
        interaction.fromCenter !== fromCenter ||
        interaction.preserveAspectRatio !== nextPreserveAspectRatio
      ) {
        preview.interaction = {
          ...interaction,
          baselinePointer: pointGrid,
          baselineTransform: transform,
          fromCenter,
          preserveAspectRatio: nextPreserveAspectRatio,
        };
        return;
      }
      const baseline = interaction.baselineTransform;
      const baselineCenter = transformCenter(baseline);
      const pointerDelta = {
        x: pointGrid.x - interaction.baselinePointer.x,
        y: pointGrid.y - interaction.baselinePointer.y,
      };
      const localDelta = rotatePoint(pointerDelta, -interaction.rotation);
      let width = interaction.signX === 0
        ? baseline.width
        : Math.max(
            0.25,
            baseline.width + localDelta.x * interaction.signX * (fromCenter ? 2 : 1)
          );
      let height = interaction.signY === 0
        ? baseline.height
        : Math.max(
            0.25,
            baseline.height + localDelta.y * interaction.signY * (fromCenter ? 2 : 1)
          );
      if (interaction.preserveAspectRatio) {
        const aspectRatio = baseline.width / baseline.height;
        const projectedHeight = Math.max(
          0.25 / aspectRatio,
          (width * aspectRatio + height) / (aspectRatio * aspectRatio + 1)
        );
        width = projectedHeight * aspectRatio;
        height = projectedHeight;
      }
      const oppositeLocal = {
        x: interaction.signX === 0 ? 0 : (-interaction.signX * baseline.width) / 2,
        y: interaction.signY === 0 ? 0 : (-interaction.signY * baseline.height) / 2,
      };
      const fixedWorld = addPoint(
        baselineCenter,
        rotatePoint(oppositeLocal, interaction.rotation)
      );
      const center = fromCenter
        ? baselineCenter
        : addPoint(
            fixedWorld,
            rotatePoint(
              { x: (interaction.signX * width) / 2, y: (interaction.signY * height) / 2 },
              interaction.rotation
            )
          );
      nextTransform = {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        rotation: interaction.rotation,
      };
    }
    engine.updatePreview(token, { ...preview.command, transform: nextTransform });
  }

  return engine;
}

export function pickAssetHandle(
  transform: AssetTransform,
  pointGrid: GridPoint,
  cssPixelsPerGrid: number
): AssetHandle | null {
  if (!Number.isFinite(cssPixelsPerGrid) || cssPixelsPerGrid <= 0) return null;
  const center = transformCenter(transform);
  const local = rotatePoint(
    { x: pointGrid.x - center.x, y: pointGrid.y - center.y },
    -transform.rotation
  );
  const tolerance = 8 / cssPixelsPerGrid;
  const rotateCenter = { x: 0, y: -transform.height / 2 - 28 / cssPixelsPerGrid };
  if (Math.hypot(local.x - rotateCenter.x, local.y - rotateCenter.y) <= tolerance) {
    return "rotate";
  }
  const handles = [
    ["north-west", -1, -1],
    ["north", 0, -1],
    ["north-east", 1, -1],
    ["east", 1, 0],
    ["south-east", 1, 1],
    ["south", 0, 1],
    ["south-west", -1, 1],
    ["west", -1, 0],
  ] as const;
  for (const [handle, signX, signY] of handles) {
    if (
      Math.abs(local.x - (signX * transform.width) / 2) <= tolerance &&
      Math.abs(local.y - (signY * transform.height) / 2) <= tolerance
    ) {
      return handle;
    }
  }
  return null;
}

function pickTableInteractionHandle(
  table: TableCamera,
  pointGrid: GridPoint,
  cssPixelsPerGrid: number,
  display: DisplayConfiguration
): TableResizeHandle | "move" | null {
  if (!isFinitePoint(pointGrid) || !Number.isFinite(cssPixelsPerGrid) || cssPixelsPerGrid <= 0) {
    return null;
  }
  const bounds = getTableBounds(table, display);
  const tolerance = 10 / cssPixelsPerGrid;
  const handles = ["north-west", "north-east", "south-east", "south-west"] as const;
  for (const handle of handles) {
    const corner = tableCorner(bounds, handle);
    if (Math.hypot(pointGrid.x - corner.x, pointGrid.y - corner.y) <= tolerance) {
      return handle;
    }
  }
  return (
    pointGrid.x >= bounds.left &&
    pointGrid.x <= bounds.right &&
    pointGrid.y >= bounds.top &&
    pointGrid.y <= bounds.bottom
  ) ? "move" : null;
}

function tableCorner(bounds: GridBounds, handle: TableResizeHandle): GridPoint {
  return {
    x: handle.endsWith("west") ? bounds.left : bounds.right,
    y: handle.startsWith("north") ? bounds.top : bounds.bottom,
  };
}

function oppositeTableHandle(handle: TableResizeHandle): TableResizeHandle {
  switch (handle) {
    case "north-west": return "south-east";
    case "north-east": return "south-west";
    case "south-east": return "north-west";
    case "south-west": return "north-east";
  }
}

function isFinitePoint(point: GridPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function pickImageAsset(scene: SceneDocument, pointGrid: GridPoint): ImageAsset | null {
  for (let index = scene.assets.length - 1; index >= 0; index--) {
    const asset = scene.assets[index];
    const layer = scene.layers.find((candidate) => candidate.id === asset.layerId);
    if (!asset.visible || !layer?.visible) continue;
    const transform = asset.transform;
    const centerX = transform.x + transform.width / 2;
    const centerY = transform.y + transform.height / 2;
    const radians = (-transform.rotation * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const deltaX = pointGrid.x - centerX;
    const deltaY = pointGrid.y - centerY;
    const localX = deltaX * cosine - deltaY * sine;
    const localY = deltaX * sine + deltaY * cosine;
    if (Math.abs(localX) <= transform.width / 2 && Math.abs(localY) <= transform.height / 2) {
      return asset;
    }
  }
  return null;
}

export function pickLight(scene: SceneDocument, pointGrid: GridPoint, cssPixelsPerGrid: number): LightSelection | null {
  if (!isFinitePoint(pointGrid) || !Number.isFinite(cssPixelsPerGrid) || cssPixelsPerGrid <= 0) return null;
  const tolerance = 10 / cssPixelsPerGrid;
  for (let layerIndex = scene.layers.length - 1; layerIndex >= 0; layerIndex--) {
    const layer = scene.layers[layerIndex];
    if (layer.type !== "fog" || !layer.visible) continue;
    for (let lightIndex = layer.lightSources.length - 1; lightIndex >= 0; lightIndex--) {
      const position = layer.lightSources[lightIndex].position;
      if (Math.hypot(position.x - pointGrid.x, position.y - pointGrid.y) <= tolerance) {
        return { layerId: layer.id, lightIndex };
      }
    }
  }
  return null;
}

export function snapCalibratedAssetTransform(
  transform: AssetTransform,
  calibration: AssetCalibration,
  threshold = GRID_SNAP_THRESHOLD
): AssetTransform {
  if (!Number.isFinite(threshold) || threshold < 0) return transform;
  const quarterTurn = Math.round(transform.rotation / 90);
  if (Math.abs(transform.rotation - quarterTurn * 90) > 1e-8) return transform;
  const calibrationPoint = calibratedAssetGridPoint(transform, calibration);
  const delta = {
    x: Math.round(calibrationPoint.x) - calibrationPoint.x,
    y: Math.round(calibrationPoint.y) - calibrationPoint.y,
  };
  return Math.hypot(delta.x, delta.y) <= threshold
    ? {
        ...transform,
        x: Math.round((transform.x + delta.x) * 1e12) / 1e12,
        y: Math.round((transform.y + delta.y) * 1e12) / 1e12,
      }
    : transform;
}

export function snapPointToGrid(point: GridPoint, threshold = GRID_SNAP_THRESHOLD): GridPoint {
  if (!isFinitePoint(point) || !Number.isFinite(threshold) || threshold < 0) return point;
  const snapped = { x: Math.round(point.x), y: Math.round(point.y) };
  return Math.hypot(snapped.x - point.x, snapped.y - point.y) <= threshold ? snapped : point;
}

export function snapFogPolygonTranslation(
  vertices: readonly GridPoint[],
  threshold = GRID_SNAP_THRESHOLD
): { readonly vertices: readonly GridPoint[]; readonly snapPoint: GridPoint | null } {
  if (!Number.isFinite(threshold) || threshold < 0) return { vertices, snapPoint: null };
  let best: { readonly point: GridPoint; readonly delta: GridPoint; readonly distance: number } | null = null;
  for (const vertex of vertices) {
    const point = { x: Math.round(vertex.x), y: Math.round(vertex.y) };
    const delta = { x: point.x - vertex.x, y: point.y - vertex.y };
    const distance = Math.hypot(delta.x, delta.y);
    if (distance <= threshold && (!best || distance < best.distance)) best = { point, delta, distance };
  }
  if (!best) return { vertices, snapPoint: null };
  return {
    vertices: vertices.map((vertex) => ({
      x: Math.round((vertex.x + best.delta.x) * 1e12) / 1e12,
      y: Math.round((vertex.y + best.delta.y) * 1e12) / 1e12,
    })),
    snapPoint: best.point,
  };
}

function calibratedAssetGridPoint(transform: AssetTransform, calibration: AssetCalibration): GridPoint {
  const center = transformCenter(transform);
  const localCalibrationPoint = {
    x: calibration.xOffset / calibration.ppiX - transform.width / 2,
    y: calibration.yOffset / calibration.ppiY - transform.height / 2,
  };
  return addPoint(center, rotatePoint(localCalibrationPoint, Math.round(transform.rotation / 90) * 90));
}

function findAsset(scene: SceneDocument, assetId: string): ImageAsset | undefined {
  return scene.assets.find((asset) => asset.id === assetId);
}

function findEffect(scene: SceneDocument, effectId: string): SceneEffect | undefined {
  for (const layer of scene.layers) {
    if (layer.type === "effects") {
      const effect = layer.effects.find((candidate) => candidate.id === effectId);
      if (effect) return effect;
    }
  }
  return undefined;
}

function effectBySelection(scene: SceneDocument, selection: EffectSelection): SceneEffect | undefined {
  const layer = scene.layers.find((candidate) => candidate.id === selection.layerId);
  return layer?.type === "effects"
    ? layer.effects.find((effect) => effect.id === selection.effectId)
    : undefined;
}

function applyPreview(scene: SceneDocument, command: PreviewCommand, version: number): SceneDocument {
  if (command.type === "asset.transform") return applyTransform(scene, command, version);
  if (command.type === "table.camera") return applyTable(scene, command.table, version);
  if (command.type === "light.insert") return applyLight(scene, command.layerId, command.index ?? lightCollectionById(scene, command.layerId).length, command.light, version, true);
  if (command.type === "light.update") return applyLight(scene, command.layerId, command.lightIndex, command.light, version);
  if (command.type === "effect.insert") return applyEffect(scene, command.layerId, command.index ?? effectCollectionById(scene, command.layerId).length, command.effect, version, true);
  if (command.type === "effect.update") {
    const index = effectCollectionById(scene, command.layerId).findIndex((effect) => effect.id === command.effectId);
    return applyEffect(scene, command.layerId, index, command.effect, version);
  }
  if (command.type === "fog.walls.update") return applyWallPolygons(scene, command.layerId, command.polygons, version);
  return applyFogPolygon(
    scene,
    command.layerId,
    command.collection,
    command.type === "fog.polygon.insert"
      ? command.index ?? fogCollectionById(scene, command.layerId, command.collection).length
      : command.polygonIndex,
    command.polygon,
    version,
    command.type === "fog.polygon.insert"
  );
}

function applyEffect(
  scene: SceneDocument,
  layerId: string,
  index: number,
  effect: SceneEffect | undefined,
  version: number,
  insert = false
): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.map((layer) => {
      if (layer.id !== layerId || layer.type !== "effects") return layer;
      const effects = [...layer.effects];
      if (effect) {
        if (insert) effects.splice(index, 0, effect);
        else effects[index] = effect;
      } else effects.splice(index, 1);
      return { ...layer, effects };
    }),
  });
}

function applyWallPolygons(
  scene: SceneDocument,
  layerId: string,
  polygons: readonly FogPolygon[],
  version: number
): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.map((layer) => layer.id === layerId && layer.type === "fog"
      ? { ...layer, obstructionPolygons: polygons }
      : layer),
  });
}

function applyLight(
  scene: SceneDocument,
  layerId: string,
  index: number,
  light: SceneLight | undefined,
  version: number,
  insert = false
): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.map((layer) => {
      if (layer.id !== layerId || layer.type !== "fog") return layer;
      const lightSources = [...layer.lightSources];
      if (light) {
        if (insert) lightSources.splice(index, 0, light);
        else lightSources[index] = light;
      } else lightSources.splice(index, 1);
      return { ...layer, lightSources };
    }),
  });
}

function applyTransform(
  scene: SceneDocument,
  command: Extract<PreviewCommand, { readonly type: "asset.transform" }>,
  version: number
): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    assets: scene.assets.map((asset) =>
      asset.id === command.assetId ? { ...asset, transform: command.transform } : asset
    ),
  });
}

function applyCalibration(
  scene: SceneDocument,
  assetId: string,
  calibration: AssetCalibration | undefined,
  transform: AssetTransform,
  version: number
): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    assets: scene.assets.map((asset) => {
      if (asset.id !== assetId) return asset;
      return { ...asset, calibration, transform };
    }),
  });
}

function applyTable(scene: SceneDocument, table: TableCamera, version: number): SceneDocument {
  return freezeSceneDocument({ ...scene, version, table });
}

function applyInsert(scene: SceneDocument, asset: ImageAsset, version: number): SceneDocument {
  const layers = scene.layers.map((layer) => layer.id === asset.layerId && layer.type === "assets"
    ? { ...layer, assetIds: [...layer.assetIds, asset.id] }
    : layer);
  const assetsById = new Map([...scene.assets, asset].map((item) => [item.id, item]));
  return freezeSceneDocument({
    ...scene,
    version,
    layers,
    assets: orderAssets(layers, assetsById),
  });
}

function applyRemove(scene: SceneDocument, assetId: string, version: number): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.map((layer) => layer.type === "assets"
      ? { ...layer, assetIds: layer.assetIds.filter((id) => id !== assetId) }
      : layer),
    assets: scene.assets.filter((asset) => asset.id !== assetId),
  });
}

function applyInsertAt(
  scene: SceneDocument,
  asset: ImageAsset,
  layerIndex: number,
  version: number
): SceneDocument {
  const layers = scene.layers.map((layer) => {
    if (layer.id !== asset.layerId || layer.type !== "assets") return layer;
    const assetIds = [...layer.assetIds];
    assetIds.splice(layerIndex, 0, asset.id);
    return { ...layer, assetIds };
  });
  const assetsById = new Map([...scene.assets, asset].map((item) => [item.id, item]));
  return freezeSceneDocument({ ...scene, version, layers, assets: orderAssets(layers, assetsById) });
}

function applyLayerInsert(
  scene: SceneDocument,
  layer: SceneLayer,
  index: number,
  version: number
): SceneDocument {
  const layers = [...scene.layers];
  layers.splice(index, 0, layer);
  return freezeSceneDocument({ ...scene, version, layers });
}

function applyLayerRemove(scene: SceneDocument, layerId: string, version: number): SceneDocument {
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  if (layer && !isLayerEmpty(layer)) throw new Error("Cannot remove a non-empty layer through insertion undo");
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.filter((candidate) => candidate.id !== layerId),
  });
}

function applyLayerDelete(scene: SceneDocument, layerId: string, version: number): SceneDocument {
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  const removedIds = new Set(layer && layer.type !== "effects" ? layer.assetIds : []);
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.filter((candidate) => candidate.id !== layerId),
    assets: scene.assets.filter((asset) => !removedIds.has(asset.id)),
  });
}

function applyLayerRestore(
  scene: SceneDocument,
  layer: SceneLayer,
  restoredAssets: readonly ImageAsset[],
  index: number,
  version: number
): SceneDocument {
  const layers = [...scene.layers];
  layers.splice(index, 0, layer);
  const assetsById = new Map([...scene.assets, ...restoredAssets].map((asset) => [asset.id, asset]));
  return freezeSceneDocument({ ...scene, version, layers, assets: orderAssets(layers, assetsById) });
}

function applyAssetVisibility(
  scene: SceneDocument,
  assetId: string,
  visible: boolean,
  version: number
): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    assets: scene.assets.map((asset) => asset.id === assetId ? { ...asset, visible } : asset),
  });
}

function applySceneName(scene: SceneDocument, name: string, version: number): SceneDocument {
  return freezeSceneDocument({ ...scene, name, version });
}

function applyLayerName(scene: SceneDocument, layerId: string, name: string, version: number): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.map((layer) => layer.id === layerId ? { ...layer, name } : layer),
  });
}

function applyLayerVisibility(
  scene: SceneDocument,
  layerId: string,
  visible: boolean,
  version: number
): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.map((layer) => layer.id === layerId ? { ...layer, visible } : layer),
  });
}

function applyLayerMove(
  scene: SceneDocument,
  fromIndex: number,
  toIndex: number,
  version: number
): SceneDocument {
  const layers = [...scene.layers];
  const [layer] = layers.splice(fromIndex, 1);
  layers.splice(toIndex, 0, layer);
  const assetsById = new Map(scene.assets.map((asset) => [asset.id, asset]));
  return freezeSceneDocument({
    ...scene,
    version,
    layers,
    assets: orderAssets(layers, assetsById),
  });
}

function applyFogPolygon(
  scene: SceneDocument,
  layerId: string,
  collection: FogPolygonCollection,
  index: number,
  polygon: FogPolygon | undefined,
  version: number,
  insert = false
): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.map((layer) => {
      if (layer.id !== layerId || layer.type !== "fog") return layer;
      const polygons = [...fogCollection(layer, collection)];
      if (polygon) {
        if (insert) polygons.splice(index, 0, polygon);
        else if (index < polygons.length) polygons[index] = polygon;
        else polygons.splice(index, 0, polygon);
      } else {
        polygons.splice(index, 1);
      }
      return collection === "fog"
        ? { ...layer, fogPolygons: polygons }
        : collection === "clear"
          ? { ...layer, fogClearPolygons: polygons }
          : { ...layer, obstructionPolygons: polygons };
    }),
  });
}

function fogCollection(
  layer: Extract<SceneLayer, { readonly type: "fog" }>,
  collection: FogPolygonCollection
): readonly FogPolygon[] {
  return collection === "fog" ? layer.fogPolygons : collection === "clear" ? layer.fogClearPolygons : layer.obstructionPolygons;
}

function fogCollectionById(
  scene: SceneDocument,
  layerId: string,
  collection: FogPolygonCollection
): readonly FogPolygon[] {
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  return layer?.type === "fog" ? fogCollection(layer, collection) : [];
}

function fogLayerById(
  scene: SceneDocument,
  layerId: string
): Extract<SceneLayer, { readonly type: "fog" }> | undefined {
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  return layer?.type === "fog" ? layer : undefined;
}

function snapWallOrGrid(
  layer: Extract<SceneLayer, { readonly type: "fog" }> | undefined,
  polygons: readonly FogPolygon[],
  point: GridPoint,
  sourcePolygonIndex: number | undefined,
  snapToGrid: boolean
): { readonly point: GridPoint; readonly polygons: readonly FogPolygon[]; readonly snapped: boolean } {
  const wallSnap = layer?.visible
    ? snapPointToWalls(polygons, point, sourcePolygonIndex, snapToGrid)
    : null;
  const gridPoint = snapToGrid ? snapPointToGrid(point) : point;
  const gridDistance = Math.hypot(gridPoint.x - point.x, gridPoint.y - point.y);
  if (wallSnap) {
    const wallDistance = Math.hypot(wallSnap.point.x - point.x, wallSnap.point.y - point.y);
    if (gridPoint === point || wallDistance <= gridDistance) return { ...wallSnap, snapped: true };
  }
  return { point: gridPoint, polygons, snapped: gridPoint !== point };
}

function snapPointToWalls(
  polygons: readonly FogPolygon[],
  point: GridPoint,
  sourcePolygonIndex: number | undefined,
  snapToGrid: boolean,
): { readonly point: GridPoint; readonly polygons: readonly FogPolygon[] } | null {
  let best: {
    readonly point: GridPoint;
    readonly distance: number;
    readonly polygonIndex: number;
    readonly segmentIndex?: number;
  } | null = null;
  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
    if (polygonIndex === sourcePolygonIndex || !polygons[polygonIndex].visibleOnTable) continue;
    const vertices = polygons[polygonIndex].vertices;
    for (const vertex of vertices) {
      const distance = Math.hypot(vertex.x - point.x, vertex.y - point.y);
      if (distance <= GRID_SNAP_THRESHOLD && (!best || distance < best.distance)) {
        best = { point: vertex, distance, polygonIndex };
      }
    }
  }
  if (best) return { point: best.point, polygons };
  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
    if (polygonIndex === sourcePolygonIndex || !polygons[polygonIndex].visibleOnTable) continue;
    const vertices = polygons[polygonIndex].vertices;
    for (let segmentIndex = 0; segmentIndex < vertices.length - 1; segmentIndex++) {
      const projected = closestPointOnSegment(point, vertices[segmentIndex], vertices[segmentIndex + 1]);
      const gridPoint = { x: Math.round(point.x), y: Math.round(point.y) };
      const gridProjection = snapToGrid ? closestPointOnSegment(gridPoint, vertices[segmentIndex], vertices[segmentIndex + 1]) : null;
      const wallGridPoint = gridProjection?.interior &&
        Math.hypot(gridPoint.x - point.x, gridPoint.y - point.y) <= GRID_SNAP_THRESHOLD &&
        Math.hypot(gridProjection.point.x - gridPoint.x, gridProjection.point.y - gridPoint.y) <= 1e-9
        ? gridPoint
        : null;
      const candidate = wallGridPoint ?? projected.point;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance <= GRID_SNAP_THRESHOLD && (!best || distance < best.distance)) {
        best = {
          point: candidate,
          distance,
          polygonIndex,
          ...(wallGridPoint || projected.interior ? { segmentIndex } : {}),
        };
      }
    }
  }
  if (!best) return null;
  if (best.segmentIndex === undefined) return { point: best.point, polygons };
  const target = polygons[best.polygonIndex];
  const vertices = [...target.vertices];
  vertices.splice(best.segmentIndex + 1, 0, best.point);
  const next = [...polygons];
  next[best.polygonIndex] = { ...target, vertices };
  return { point: best.point, polygons: next };
}

function closestPointOnSegment(
  point: GridPoint,
  start: GridPoint,
  end: GridPoint
): { readonly point: GridPoint; readonly interior: boolean } {
  const x = end.x - start.x;
  const y = end.y - start.y;
  const lengthSquared = x * x + y * y;
  if (lengthSquared === 0) return { point: start, interior: false };
  const rawAmount = ((point.x - start.x) * x + (point.y - start.y) * y) / lengthSquared;
  const amount = Math.max(0, Math.min(1, rawAmount));
  if (amount <= 0) return { point: start, interior: false };
  if (amount >= 1) return { point: end, interior: false };
  return { point: { x: start.x + amount * x, y: start.y + amount * y }, interior: true };
}

function lightCollectionById(scene: SceneDocument, layerId: string): readonly SceneLight[] {
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  return layer?.type === "fog" ? layer.lightSources : [];
}

function effectCollectionById(scene: SceneDocument, layerId: string): readonly SceneEffect[] {
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  return layer?.type === "effects" ? layer.effects : [];
}

function selectedFogPolygonValue(scene: SceneDocument, selection: FogPolygonSelection): FogPolygon | undefined {
  const layer = scene.layers.find((candidate) => candidate.id === selection.layerId);
  return layer?.type === "fog" ? fogCollection(layer, selection.collection)[selection.polygonIndex] : undefined;
}

function pickFogVertex(polygon: FogPolygon, pointGrid: GridPoint, cssPixelsPerGrid: number): number {
  return pickClosedPolygonVertex(polygon.vertices, pointGrid, cssPixelsPerGrid);
}

function pickClosedPolygonVertex(vertices: readonly GridPoint[], pointGrid: GridPoint, cssPixelsPerGrid: number): number {
  const tolerance = 9 / cssPixelsPerGrid;
  return vertices.findIndex((vertex) => Math.hypot(vertex.x - pointGrid.x, vertex.y - pointGrid.y) <= tolerance);
}

function pickEffectEdge(
  scene: SceneDocument,
  pointGrid: GridPoint,
  cssPixelsPerGrid: number
): EffectSelection | null {
  const tolerance = 8 / cssPixelsPerGrid;
  for (let layerIndex = scene.layers.length - 1; layerIndex >= 0; layerIndex--) {
    const layer = scene.layers[layerIndex];
    if (layer.type !== "effects" || !layer.visible) continue;
    for (let effectIndex = layer.effects.length - 1; effectIndex >= 0; effectIndex--) {
      const effect = layer.effects[effectIndex];
      if (!effect.visible) continue;
      const effectTolerance = effect.kind === "wall-of-fire" ? Math.max(tolerance, effect.width / 2) : tolerance;
      const segmentCount = effectGeometryKind(effect) === "open-path" ? Math.max(0, effect.vertices.length - 1) : effect.vertices.length;
      for (let vertexIndex = 0; vertexIndex < segmentCount; vertexIndex++) {
        const next = effect.vertices[(vertexIndex + 1) % effect.vertices.length];
        if (distanceToSegment(pointGrid, effect.vertices[vertexIndex], next) <= effectTolerance) {
          return { layerId: layer.id, effectId: effect.id };
        }
      }
    }
  }
  return null;
}

export function pickFogPolygonEdge(
  scene: SceneDocument,
  pointGrid: GridPoint,
  cssPixelsPerGrid: number
): FogPolygonSelection | null {
  if (!isFinitePoint(pointGrid) || !Number.isFinite(cssPixelsPerGrid) || cssPixelsPerGrid <= 0) return null;
  const tolerance = 8 / cssPixelsPerGrid;
  for (let layerIndex = scene.layers.length - 1; layerIndex >= 0; layerIndex--) {
    const layer = scene.layers[layerIndex];
    if (layer.type !== "fog" || !layer.visible) continue;
    for (const collection of ["wall", "clear", "fog"] as const) {
      const polygons = fogCollection(layer, collection);
      for (let polygonIndex = polygons.length - 1; polygonIndex >= 0; polygonIndex--) {
        const vertices = polygons[polygonIndex].vertices;
        const segmentCount = collection === "wall" ? Math.max(0, vertices.length - 1) : vertices.length;
        for (let vertexIndex = 0; vertexIndex < segmentCount; vertexIndex++) {
          const next = vertices[(vertexIndex + 1) % vertices.length];
          if (distanceToSegment(pointGrid, vertices[vertexIndex], next) <= tolerance) {
            return { layerId: layer.id, collection, polygonIndex };
          }
        }
      }
    }
  }
  return null;
}

function distanceToSegment(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const x = end.x - start.x;
  const y = end.y - start.y;
  const lengthSquared = x * x + y * y;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * x + (point.y - start.y) * y) / lengthSquared));
  return Math.hypot(point.x - (start.x + amount * x), point.y - (start.y + amount * y));
}

function pointNearPolyline(point: GridPoint, vertices: readonly GridPoint[], tolerance: number): boolean {
  return vertices.slice(0, -1).some((vertex, index) => distanceToSegment(point, vertex, vertices[index + 1]) <= tolerance);
}

function pointInPolygon(point: GridPoint, vertices: readonly GridPoint[]): boolean {
  let inside = false;
  for (let current = 0, previous = vertices.length - 1; current < vertices.length; previous = current++) {
    const a = vertices[current];
    const b = vertices[previous];
    if (((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function sameFogSelection(left: FogPolygonSelection | null, right: FogPolygonSelection | null): boolean {
  return left === right || Boolean(left && right &&
    left.layerId === right.layerId &&
    left.collection === right.collection &&
    left.polygonIndex === right.polygonIndex);
}

function sameLightSelection(left: LightSelection | null, right: LightSelection | null): boolean {
  return left === right || Boolean(left && right && left.layerId === right.layerId && left.lightIndex === right.lightIndex);
}

function sameEffectSelection(left: EffectSelection | null, right: EffectSelection | null): boolean {
  return left === right || Boolean(left && right && left.layerId === right.layerId && left.effectId === right.effectId);
}

function normalizeName(name: string, subject: "Scene" | "Layer" | "Effect"): { readonly name: string } | { readonly error: string } {
  if (typeof name !== "string") return { error: `${subject} name must be a string` };
  const normalized = name.trim();
  if (!normalized) return { error: `${subject} name is required` };
  if (normalized.length > 120) return { error: `${subject} name must be 120 characters or fewer` };
  return { name: normalized };
}

function validateLight(light: SceneLight): string | null {
  if (!isFinitePoint(light.position)) return "Light position must contain finite numbers";
  if (!Number.isFinite(light.brightLightDistance) || !Number.isFinite(light.dimLightDistance) || light.brightLightDistance < 0 || light.dimLightDistance < 0) {
    return "Light distances must be non-negative finite numbers";
  }
  if (light.brightLightDistance > light.dimLightDistance) return "Bright light distance cannot exceed dim light distance";
  if (![light.color.r, light.color.g, light.color.b, light.color.a].every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return "Light color channels must be integers from 0 to 255";
  }
  return null;
}

function validateEffect(effect: SceneEffect, preview = false): string | null {
  if (!effect || (effect.kind !== "rain" && effect.kind !== "embers" && effect.kind !== "cloud" && effect.kind !== "wall-of-fire")) return "Unsupported effect kind";
  if (typeof effect.id !== "string" || !effect.id.trim()) return "Effect ID is required";
  const name = normalizeName(effect.name, "Effect");
  if ("error" in name) return name.error;
  if (typeof effect.visible !== "boolean") return "Effect visibility must be a boolean";
  if (!Array.isArray(effect.vertices) || !effect.vertices.every(isFinitePoint)) return "Effect vertices must contain finite numbers";
  const vertices = effectGeometryKind(effect) === "open-path" ? effect.vertices : dedupeClosingVertex(effect.vertices);
  if (!preview && vertices.length < (effectGeometryKind(effect) === "open-path" ? 2 : 3)) {
    return effectGeometryKind(effect) === "open-path" ? "Effect paths require at least two vertices" : "Effects require at least three vertices";
  }
  if (!preview && effectGeometryKind(effect) === "open-path" && !vertices.slice(1).some((vertex, index) => !samePoint(vertex, vertices[index]))) {
    return "Effect paths require at least one nonzero segment";
  }
  if (!Number.isInteger(effect.seed) || effect.seed < 0 || effect.seed > 0xffffffff) return "Effect seed must be a uint32";
  if (!effect.color || ![effect.color.r, effect.color.g, effect.color.b].every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return "Effect color channels must be integers from 0 to 255";
  }
  if (!Number.isFinite(effect.opacity) || effect.opacity < 0 || effect.opacity > 1) return "Effect opacity must be between 0 and 1";
  if (!Number.isFinite(effect.speed) || effect.speed <= 0) return "Effect speed must be a positive finite number";
  if (effect.kind === "cloud") {
    if (!Number.isFinite(effect.coverage) || effect.coverage < 0 || effect.coverage > 1) return "Cloud coverage must be between 0 and 1";
    if (effect.speed > 2.5) return "Cloud speed must not exceed 2.5 grid units per second";
    if (!Number.isFinite(effect.scale) || effect.scale < 0.25 || effect.scale > 12) return "Cloud scale must be between 0.25 and 12 grid units";
    if (!Number.isFinite(effect.turbulence) || effect.turbulence < 0 || effect.turbulence > 1) return "Cloud turbulence must be between 0 and 1";
    return null;
  }
  if (effect.kind === "wall-of-fire") {
    if (!Number.isFinite(effect.width) || effect.width < 0.1 || effect.width > 6) return "Wall of Fire width must be between 0.1 and 6 grid units";
    if (!Number.isFinite(effect.intensity) || effect.intensity < 0 || effect.intensity > 1) return "Wall of Fire intensity must be between 0 and 1";
    if (effect.speed < 0.5 || effect.speed > 6) return "Wall of Fire speed must be between 0.5 and 6";
    if (!Number.isFinite(effect.turbulence) || effect.turbulence < 0 || effect.turbulence > 1) return "Wall of Fire turbulence must be between 0 and 1";
    return null;
  }
  if (!Number.isFinite(effect.density) || effect.density < 0) return "Effect density must be a non-negative finite number";
  const particleSize = effect.kind === "rain" ? effect.dropSize : effect.particleSize;
  return !Number.isFinite(particleSize) || particleSize <= 0
    ? "Effect particle size must be a positive finite number"
    : null;
}

function sameEffect(left: SceneEffect, right: SceneEffect): boolean {
  if (left.kind !== right.kind) return false;
  const sameKindParameters = left.kind === "rain"
    ? left.density === (right as typeof left).density && left.speed === (right as typeof left).speed && left.dropSize === (right as typeof left).dropSize
    : left.kind === "embers"
      ? left.density === (right as typeof left).density && left.speed === (right as typeof left).speed && left.particleSize === (right as typeof left).particleSize
      : left.kind === "cloud"
        ? left.coverage === (right as typeof left).coverage && left.speed === (right as typeof left).speed && left.scale === (right as typeof left).scale && left.turbulence === (right as typeof left).turbulence
        : left.width === (right as typeof left).width && left.intensity === (right as typeof left).intensity && left.speed === (right as typeof left).speed && left.turbulence === (right as typeof left).turbulence;
  return left.id === right.id && left.name === right.name &&
    left.visible === right.visible && left.seed === right.seed &&
    left.color.r === right.color.r && left.color.g === right.color.g && left.color.b === right.color.b &&
    left.opacity === right.opacity && sameKindParameters &&
    left.vertices.length === right.vertices.length &&
    left.vertices.every((vertex, index) => samePoint(vertex, right.vertices[index]));
}

function effectGeometryKind(effect: SceneEffect): "polygon" | "open-path" {
  return effect.kind === "wall-of-fire" ? "open-path" : "polygon";
}

function isLayerEmpty(layer: SceneLayer): boolean {
  if (layer.type === "assets") return layer.assetIds.length === 0;
  if (layer.type === "effects") return layer.effects.length === 0;
  return layer.assetIds.length === 0 && layer.fogPolygons.length === 0 &&
    layer.fogClearPolygons.length === 0 && layer.obstructionPolygons.length === 0 && layer.lightSources.length === 0;
}

function sameLight(left: SceneLight, right: SceneLight): boolean {
  return samePoint(left.position, right.position) &&
    left.brightLightDistance === right.brightLightDistance &&
    left.dimLightDistance === right.dimLightDistance &&
    left.color.r === right.color.r && left.color.g === right.color.g && left.color.b === right.color.b && left.color.a === right.color.a;
}

function orderAssets(
  layers: readonly SceneLayer[],
  assetsById: ReadonlyMap<string, ImageAsset>
): ImageAsset[] {
  return layers.flatMap((layer) => (layer.type === "effects" ? [] : layer.assetIds).flatMap((assetId) => {
    const asset = assetsById.get(assetId);
    return asset ? [asset] : [];
  }));
}

function validateTransform(transform: AssetTransform): string | null {
  const values = [transform.x, transform.y, transform.rotation, transform.width, transform.height];
  if (!values.every(Number.isFinite)) return "Asset transforms must contain finite numbers";
  if (transform.width <= 0 || transform.height <= 0) return "Asset dimensions must be positive";
  return null;
}

function validateCalibration(calibration: AssetCalibration): string | null {
  if (![calibration.xOffset, calibration.yOffset, calibration.ppiX, calibration.ppiY].every(Number.isFinite)) {
    return "Asset calibration must contain finite numbers";
  }
  if (calibration.ppiX <= 0 || calibration.ppiY <= 0) return "Pixels per inch must be positive";
  return null;
}

function sameCalibration(left: AssetCalibration | undefined, right: AssetCalibration | undefined): boolean {
  return left === right || Boolean(left && right &&
    left.xOffset === right.xOffset &&
    left.yOffset === right.yOffset &&
    left.ppiX === right.ppiX &&
    left.ppiY === right.ppiY);
}

function validateTable(table: TableCamera): string | null {
  if (!Number.isFinite(table.originGrid.x) || !Number.isFinite(table.originGrid.y)) {
    return "Table origin must contain finite numbers";
  }
  if (!Number.isFinite(table.scale) || table.scale <= 0) {
    return "Table scale must be a positive finite number";
  }
  if (typeof table.displayGrid !== "boolean") return "Table displayGrid must be a boolean";
  return null;
}

function validateFogPolygon(polygon: FogPolygon, collection: FogPolygonCollection, preview = false): string | null {
  if (typeof polygon.visibleOnTable !== "boolean") return "Fog visibility must be a boolean";
  if (!polygon.vertices.every(isFinitePoint)) return "Fog vertices must contain finite numbers";
  const minimum = collection === "wall" ? 2 : 3;
  if (!preview && dedupeClosingVertex(polygon.vertices).length < minimum) {
    return collection === "wall" ? "Walls require at least two vertices" : "Fog polygons require at least three vertices";
  }
  return null;
}

function sameFogPolygon(left: FogPolygon, right: FogPolygon): boolean {
  return left.visibleOnTable === right.visibleOnTable &&
    left.vertices.length === right.vertices.length &&
    left.vertices.every((vertex, index) => samePoint(vertex, right.vertices[index]));
}

function sameFogPolygons(left: readonly FogPolygon[], right: readonly FogPolygon[]): boolean {
  return left.length === right.length && left.every((polygon, index) => sameFogPolygon(polygon, right[index]));
}

function samePoint(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameOptionalPoint(left: GridPoint | null, right: GridPoint | null): boolean {
  return left === right || Boolean(left && right && samePoint(left, right));
}

function dedupeClosingVertex(vertices: readonly GridPoint[]): readonly GridPoint[] {
  if (vertices.length > 1 && samePoint(vertices[0], vertices.at(-1)!)) return vertices.slice(0, -1);
  return vertices;
}

function freezeTable(table: TableCamera): TableCamera {
  return Object.freeze({
    originGrid: Object.freeze({ ...table.originGrid }),
    scale: table.scale,
    displayGrid: table.displayGrid,
  });
}

function sameTable(left: TableCamera, right: TableCamera): boolean {
  return (
    left.originGrid.x === right.originGrid.x &&
    left.originGrid.y === right.originGrid.y &&
    left.scale === right.scale &&
    left.displayGrid === right.displayGrid
  );
}

function sameTransform(left: AssetTransform, right: AssetTransform): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.rotation === right.rotation &&
    left.width === right.width &&
    left.height === right.height
  );
}

function transformCenter(transform: AssetTransform): GridPoint {
  return { x: transform.x + transform.width / 2, y: transform.y + transform.height / 2 };
}

function rotatePoint(point: GridPoint, degrees: number): GridPoint {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function addPoint(left: GridPoint, right: GridPoint): GridPoint {
  return { x: left.x + right.x, y: left.y + right.y };
}

function resizeHandleSigns(handle: ResizeHandle): readonly [-1 | 0 | 1, -1 | 0 | 1] {
  const signX = handle.endsWith("west") || handle === "west"
    ? -1
    : handle.endsWith("east") || handle === "east"
      ? 1
      : 0;
  const signY = handle.startsWith("north") || handle === "north"
    ? -1
    : handle.startsWith("south") || handle === "south"
      ? 1
      : 0;
  return [signX, signY];
}

function normalizeDegrees(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function applyRotationSnap(value: number): number {
  const normalized = normalizeDegrees(value);
  const snapPoint = Math.round(normalized / 45) * 45;
  const delta = normalizeDegrees(normalized - snapPoint);
  return Math.abs(delta) <= 5 ? normalizeDegrees(snapPoint) : normalized;
}
