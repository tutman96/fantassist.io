import localforage from "localforage";
import { init, target } from "vgpu";
import type { Gpu, Target } from "vgpu";

import { createSceneEngine } from "@/engine/scene-engine";
import { DEFAULT_DISPLAY } from "@/engine/table-camera";
import { applyAssetVisibilityMetadata, projectV1Scene } from "@/persistence/v1/scene-adapter";
import { decodeV1Scene } from "@/persistence/v1/scene-codec";
import type { V1Scene } from "@/persistence/v1/types";
import { createBrowserImageLoader } from "@/renderer/browser-image-loader";
import { createFallbackImageUpload } from "@/renderer/image-texture";
import { createRenderPlan } from "@/renderer/render-plan";
import { browserSceneShaders } from "@/renderer/vgpu/browser-shaders";
import { createSceneExecutor } from "@/renderer/vgpu/scene-executor";
import type { SceneExecutor } from "@/renderer/vgpu/scene-executor";
import { createSceneThumbnailScheduler } from "./scene-thumbnail-scheduler";
import type { SceneThumbnailRequest, SceneThumbnailResponse } from "./scene-thumbnail-protocol";

const WIDTH = 320;
const HEIGHT = 180;
const RENDER_REVISION = 1;
const scenes = localforage.createInstance({ name: "scene_2" });
const assets = localforage.createInstance({ name: "asset_file" });
const metadata = localforage.createInstance({ name: "fantassist_v2" });
const thumbnails = localforage.createInstance({ name: "fantassist_v2_thumbnails" });
const imageLoader = createBrowserImageLoader((id) => assets.getItem<File>(id));
const scheduler = createSceneThumbnailScheduler();
let gpu: Gpu | undefined;
let destination: Target | undefined;
let executor: SceneExecutor | undefined;
let encodingCanvas: OffscreenCanvas | undefined;

self.onmessage = (event: MessageEvent<SceneThumbnailRequest>) => {
  const request = event.data;
  if (request.type !== "render") return;
  const expectedCacheKey = thumbnailCacheKey(request.sceneKey, request.expectedVersion);
  void scheduler.run(
    async () => {
      const blob = await thumbnails.getItem<Blob>(expectedCacheKey);
      return blob
        ? { type: "result", requestId: request.requestId, sceneKey: request.sceneKey, version: request.expectedVersion, blob } satisfies SceneThumbnailResponse
        : null;
    },
    () => renderThumbnail(request),
  ).then(
    (response) => self.postMessage(response),
    (cause: unknown) => self.postMessage({
      type: "error",
      requestId: request.requestId,
      message: cause instanceof Error ? cause.message : "Unable to render scene thumbnail",
    } satisfies SceneThumbnailResponse),
  );
};

async function renderThumbnail(request: SceneThumbnailRequest): Promise<SceneThumbnailResponse> {
  const bytes = await scenes.getItem<Uint8Array>(request.sceneKey);
  if (!bytes) throw new Error("Scene no longer exists");
  const storedScene: V1Scene = decodeV1Scene(bytes);
  if (storedScene.id !== request.sceneKey) throw new Error("Scene identity does not match its storage key");
  const cacheKey = thumbnailCacheKey(request.sceneKey, storedScene.version);
  const cached = await thumbnails.getItem<Blob>(cacheKey);
  if (cached) return { type: "result", requestId: request.requestId, sceneKey: request.sceneKey, version: storedScene.version, blob: cached };
  const sidecar = await metadata.getItem<{ readonly assetVisibility?: Readonly<Record<string, boolean>> }>(request.sceneKey);
  const document = applyAssetVisibilityMetadata(projectV1Scene(storedScene), sidecar?.assetVisibility);
  const sceneEngine = createSceneEngine(document);
  const snapshot = sceneEngine.getSnapshot();
  sceneEngine.dispose();
  const uploads = await Promise.all(document.assets.map(async (asset) =>
    (await imageLoader.loadImage(asset.mediaId)) ?? createFallbackImageUpload()
  ));

  try {
    if (!gpu || !destination || !executor) {
      gpu = await init({ label: "fantassist-scene-thumbnails" });
      destination = target(gpu, { size: [WIDTH, HEIGHT], format: "rgba8unorm", label: "scene-thumbnail" });
      executor = createSceneExecutor(
        gpu,
        destination,
        createRenderPlan("output"),
        browserSceneShaders,
        { kind: "output", table: document.table, display: DEFAULT_DISPLAY },
        snapshot,
        uploads,
      );
      executor.setGridVisible(document.table.displayGrid);
      await executor.prewarm();
    } else {
      await executor.replaceAssets(snapshot, uploads);
      await executor.replaceFog(snapshot);
      executor.setSnapshot(snapshot);
      executor.setView({ kind: "output", table: document.table, display: DEFAULT_DISPLAY });
      executor.setGridVisible(document.table.displayGrid);
    }
  } finally {
    uploads.forEach((upload) => upload.dispose());
  }

  await executor.render(0);
  const pixels = await destination.read();
  encodingCanvas ??= new OffscreenCanvas(WIDTH, HEIGHT);
  const context = encodingCanvas.getContext("2d");
  if (!context) throw new Error("Thumbnail image encoding is unavailable");
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), WIDTH, HEIGHT), 0, 0);
  const blob = await encodingCanvas.convertToBlob({ type: "image/png" });
  await thumbnails.setItem(cacheKey, blob);
  const prefix = `${request.sceneKey}:`;
  const obsolete = (await thumbnails.keys()).filter((key) => key.startsWith(prefix) && key !== cacheKey);
  await Promise.all(obsolete.map((key) => thumbnails.removeItem(key)));
  return { type: "result", requestId: request.requestId, sceneKey: request.sceneKey, version: storedScene.version, blob };
}

function thumbnailCacheKey(sceneKey: string, version: number): string {
  return `${sceneKey}:${version}:${WIDTH}x${HEIGHT}:renderer-${RENDER_REVISION}`;
}
