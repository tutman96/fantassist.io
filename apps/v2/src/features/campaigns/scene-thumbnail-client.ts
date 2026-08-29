import type { SceneThumbnailRequest, SceneThumbnailResponse } from "./scene-thumbnail-protocol";

interface PendingRequest {
  readonly resolve: (blob: Blob) => void;
  readonly reject: (error: Error) => void;
}

let worker: Worker | undefined;
const pending = new Map<string, PendingRequest>();
const cache = new Map<string, Promise<Blob>>();

export function requestSceneThumbnail(sceneKey: string, version: number): Promise<Blob> {
  const cacheKey = `${sceneKey}:${version}:thumbnail-v1`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;
  const requestId = crypto.randomUUID();
  const promise = new Promise<Blob>((resolve, reject) => {
    const thumbnailWorker = getWorker();
    pending.set(requestId, { resolve, reject });
    thumbnailWorker.postMessage({ type: "render", requestId, sceneKey, expectedVersion: version } satisfies SceneThumbnailRequest);
  }).catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, promise);
  return promise;
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./scene-thumbnail.worker.ts", import.meta.url), {
    type: "module",
    name: "fantassist-scene-thumbnails",
  });
  worker.onmessage = (event: MessageEvent<SceneThumbnailResponse>) => {
    const response = event.data;
    const request = pending.get(response.requestId);
    if (!request) return;
    pending.delete(response.requestId);
    if (response.type === "result") request.resolve(response.blob);
    else request.reject(new Error(response.message));
  };
  worker.onerror = () => {
    for (const request of pending.values()) request.reject(new Error("Scene thumbnail worker failed"));
    pending.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}
