import { createSampleSceneDocument, freezeSceneDocument } from "./scene-document";
import type { AssetTransform, ImageAsset, SceneDocument } from "./scene-document";
import type { GridPoint } from "./table-camera";

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
  | { readonly type: "selection.set"; readonly assetId: string | null };

export type PreviewCommand = Extract<SceneCommand, { readonly type: "asset.transform" }>;
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
  | { readonly kind: "insert"; readonly asset: ImageAsset };

interface ActivePreview {
  readonly token: PreviewToken;
  command: PreviewCommand;
  interaction?: AssetInteraction;
}

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
    const scene = preview ? applyTransform(committedScene, preview.command, revision) : committedScene;
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
    command: PreviewCommand,
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
      const error = validateTransform(command.transform);
      if (!findAsset(committedScene, command.assetId)) throw new Error(`Unknown asset '${command.assetId}'`);
      if (error) throw new Error(error);
      const token = Object.freeze({ id: ++tokenSequence });
      preview = { token, command };
      publish("editor");
      return token;
    },
    updatePreview(token, command) {
      if (!preview || preview.token.id !== token.id) return;
      if (preview.command.assetId !== command.assetId || validateTransform(command.transform)) return;
      preview.command = command;
      publish("editor");
    },
    commitPreview(token) {
      if (!preview || preview.token.id !== token.id) {
        return { ok: false, error: "Unknown preview token", revision };
      }
      const command = preview.command;
      preview = undefined;
      return transformResult(command, true, true);
    },
    cancelPreview(token) {
      if (!preview || preview.token.id !== token.id) return;
      preview = undefined;
      publish("editor");
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
    if (!preview || preview.token.id !== token.id || !preview.interaction) return;
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

export function pickImageAsset(scene: SceneDocument, pointGrid: GridPoint): ImageAsset | null {
  for (let index = scene.assets.length - 1; index >= 0; index--) {
    const asset = scene.assets[index];
    if (!asset.visible) continue;
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

function applyTransform(scene: SceneDocument, command: PreviewCommand, version: number): SceneDocument {
  return freezeSceneDocument({
    ...scene,
    version,
    assets: scene.assets.map((asset) =>
      asset.id === command.assetId ? { ...asset, transform: command.transform } : asset
    ),
  });
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

function validateTransform(transform: AssetTransform): string | null {
  const values = [transform.x, transform.y, transform.rotation, transform.width, transform.height];
  if (!values.every(Number.isFinite)) return "Asset transforms must contain finite numbers";
  if (transform.width <= 0 || transform.height <= 0) return "Asset dimensions must be positive";
  return null;
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
