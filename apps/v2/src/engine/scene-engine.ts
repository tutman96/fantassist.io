import { createSampleSceneDocument, freezeSceneDocument } from "./scene-document";
import type { AssetTransform, ImageAsset, SceneDocument, SceneLayer } from "./scene-document";
import { getTableBounds, MAX_TABLE_SCALE, MIN_TABLE_SCALE } from "./table-camera";
import type { DisplayConfiguration, GridBounds, GridPoint, TableCamera } from "./table-camera";

export type EngineListener = () => void;
export type RendererInvalidation = "all" | "editor";

export interface EngineSnapshot<TScene> {
  readonly scene: TScene;
  readonly revision: number;
}

export interface SceneEngineSnapshot extends EngineSnapshot<SceneDocument> {
  readonly presentationRevision: number;
  readonly selectedAssetId: string | null;
  readonly previewActive: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly invalidation: RendererInvalidation;
}

export type SceneCommand =
  | {
      readonly type: "asset.transform";
      readonly assetId: string;
      readonly transform: AssetTransform;
    }
  | { readonly type: "asset.insert"; readonly asset: ImageAsset }
  | { readonly type: "asset.remove"; readonly assetId: string }
  | { readonly type: "asset.visibility"; readonly assetId: string; readonly visible: boolean }
  | { readonly type: "layer.insert"; readonly layer: SceneLayer; readonly index?: number }
  | { readonly type: "layer.remove"; readonly layerId: string }
  | { readonly type: "layer.visibility"; readonly layerId: string; readonly visible: boolean }
  | { readonly type: "layer.move"; readonly layerId: string; readonly toIndex: number }
  | { readonly type: "table.camera"; readonly table: TableCamera }
  | { readonly type: "selection.set"; readonly assetId: string | null };

export type PreviewCommand = Extract<SceneCommand, { readonly type: "asset.transform" | "table.camera" }>;
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
  undo(): CommandResult;
  redo(): CommandResult;
  replaceCommittedScene(scene: SceneDocument, revision?: number): void;
  dispose(): void;
}

type HistoryEntry =
  | { readonly kind: "transform"; readonly assetId: string; readonly before: AssetTransform; readonly after: AssetTransform }
  | { readonly kind: "insert"; readonly asset: ImageAsset }
  | { readonly kind: "remove"; readonly asset: ImageAsset; readonly layerIndex: number }
  | { readonly kind: "insert-layer"; readonly layer: SceneLayer; readonly index: number }
  | { readonly kind: "remove-layer"; readonly layer: SceneLayer; readonly assets: readonly ImageAsset[]; readonly index: number }
  | { readonly kind: "asset-visibility"; readonly assetId: string; readonly before: boolean; readonly after: boolean }
  | { readonly kind: "layer-visibility"; readonly layerId: string; readonly before: boolean; readonly after: boolean }
  | { readonly kind: "move-layer"; readonly layerId: string; readonly fromIndex: number; readonly toIndex: number }
  | { readonly kind: "table-camera"; readonly before: TableCamera; readonly after: TableCamera };

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
      previewActive: preview !== undefined,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      invalidation,
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
      if (command.type === "asset.transform") return transformResult(command, true);
      if (command.type === "table.camera") return tableResult(command, true);
      if (command.type === "asset.insert") {
        if (findAsset(committedScene, command.asset.id)) {
          return { ok: false, error: `Asset '${command.asset.id}' already exists`, revision };
        }
        if (!committedScene.layers.some((layer) => layer.id === command.asset.layerId && layer.type === "assets")) {
          return { ok: false, error: `Unknown asset layer '${command.asset.layerId}'`, revision };
        }
        const error = validateTransform(command.asset.transform);
        if (error) return { ok: false, error, revision };
        revision++;
        committedScene = applyInsert(committedScene, command.asset, revision);
        undoStack = [...undoStack, { kind: "insert", asset: command.asset }];
        redoStack = [];
        selectedAssetId = command.asset.id;
        publish("all");
        return { ok: true, changed: true, revision };
      }
      if (command.type === "asset.remove") {
        const asset = findAsset(committedScene, command.assetId);
        if (!asset) return { ok: false, error: `Unknown asset '${command.assetId}'`, revision };
        const layer = committedScene.layers.find((candidate) => candidate.id === asset.layerId);
        const layerIndex = layer?.assetIds.indexOf(asset.id) ?? -1;
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
        if (command.layer.type !== "assets" || command.layer.assetIds.length > 0) {
          return { ok: false, error: "Only empty asset layers can be inserted", revision };
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
        const assets = layer.assetIds.flatMap((id) => {
          const asset = findAsset(committedScene, id);
          return asset ? [asset] : [];
        });
        revision++;
        committedScene = applyLayerDelete(committedScene, layer.id, revision);
        undoStack = [...undoStack, { kind: "remove-layer", layer, assets, index }];
        redoStack = [];
        if (selectedAssetId && layer.assetIds.includes(selectedAssetId)) selectedAssetId = null;
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
      if (command.assetId !== null && !findAsset(committedScene, command.assetId)) {
        return { ok: false, error: `Unknown asset '${command.assetId}'`, revision };
      }
      if (selectedAssetId === command.assetId) return { ok: true, changed: false, revision };
      selectedAssetId = command.assetId;
      publish("editor");
      return { ok: true, changed: true, revision };
    },
    beginPreview(command) {
      if (disposed) throw new Error("Scene engine is disposed");
      if (preview) throw new Error("A scene preview is already active");
      const error = command.type === "asset.transform"
        ? validateTransform(command.transform)
        : validateTable(command.table);
      if (command.type === "asset.transform" && !findAsset(committedScene, command.assetId)) {
        throw new Error(`Unknown asset '${command.assetId}'`);
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
      } else {
        if (validateTable(command.table)) return;
        preview.command = { type: "table.camera", table: freezeTable(command.table) };
      }
      publish("editor");
    },
    commitPreview(token) {
      if (!preview || preview.token.id !== token.id) {
        return { ok: false, error: "Unknown preview token", revision };
      }
      const command = preview.command;
      preview = undefined;
      return command.type === "asset.transform"
        ? transformResult(command, true, true)
        : tableResult(command, true, true);
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
      if (entry.kind === "remove") {
        revision++;
        committedScene = applyInsertAt(committedScene, entry.asset, entry.layerIndex, revision);
        selectedAssetId = entry.asset.id;
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
        if (selectedAssetId && entry.layer.assetIds.includes(selectedAssetId)) selectedAssetId = null;
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

function findAsset(scene: SceneDocument, assetId: string): ImageAsset | undefined {
  return scene.assets.find((asset) => asset.id === assetId);
}

function applyPreview(scene: SceneDocument, command: PreviewCommand, version: number): SceneDocument {
  return command.type === "asset.transform"
    ? applyTransform(scene, command, version)
    : applyTable(scene, command.table, version);
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

function applyTable(scene: SceneDocument, table: TableCamera, version: number): SceneDocument {
  return freezeSceneDocument({ ...scene, version, table });
}

function applyInsert(scene: SceneDocument, asset: ImageAsset, version: number): SceneDocument {
  const layers = scene.layers.map((layer) => layer.id === asset.layerId
    ? { ...layer, assetIds: [...layer.assetIds, asset.id] }
    : layer);
  const assetsById = new Map([...scene.assets, asset].map((item) => [item.id, item]));
  return freezeSceneDocument({
    ...scene,
    version,
    layers,
    assets: layers.flatMap((layer) => layer.assetIds.flatMap((id) => {
      const item = assetsById.get(id);
      return item ? [item] : [];
    })),
  });
}

function applyRemove(scene: SceneDocument, assetId: string, version: number): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.map((layer) => ({
      ...layer,
      assetIds: layer.assetIds.filter((id) => id !== assetId),
    })),
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
    if (layer.id !== asset.layerId) return layer;
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
  if (layer?.assetIds.length) throw new Error("Cannot remove a non-empty layer through insertion undo");
  return freezeSceneDocument({
    ...scene,
    version,
    layers: scene.layers.filter((candidate) => candidate.id !== layerId),
  });
}

function applyLayerDelete(scene: SceneDocument, layerId: string, version: number): SceneDocument {
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  const removedIds = new Set(layer?.assetIds ?? []);
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

function orderAssets(
  layers: readonly SceneLayer[],
  assetsById: ReadonlyMap<string, ImageAsset>
): ImageAsset[] {
  return layers.flatMap((layer) => layer.assetIds.flatMap((assetId) => {
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
