import { init, surface } from "vgpu";
import type { Gpu, Surface } from "vgpu";

import type { SceneEngineSnapshot } from "../../engine/scene-engine";
import { createFallbackImageUpload } from "../image-texture";
import type { ImageAssetLoader, ImageTextureUpload } from "../image-texture";
import { createRenderPlan } from "../render-plan";
import type { RenderView } from "../projection";
import type { RenderProfile } from "../scene-renderer";
import { browserSceneShaders } from "./browser-shaders";
import { createSceneExecutor } from "./scene-executor";

export interface BrowserSceneRenderer {
  render(time?: number): void;
  setGridVisible(visible: boolean): void;
  setSnapshot(snapshot: SceneEngineSnapshot): void;
  setView(view: RenderView): void;
  startAnimation(fps?: number): () => void;
  dispose(): void;
}

export async function createBrowserSceneRenderer(
  canvas: HTMLCanvasElement,
  profile: RenderProfile,
  initialView: RenderView,
  initialSnapshot: SceneEngineSnapshot,
  imageLoader?: ImageAssetLoader,
  onFatalError?: (error: unknown) => void
): Promise<BrowserSceneRenderer> {
  let disposed = false;
  let gpu: Gpu | undefined;
  let targetSurface: Surface | undefined;
  let stopResize: (() => void) | undefined;
  let generation = 0;
  let lastTime = 0;
  let animationFrame: number | undefined;
  let pendingTime: number | undefined;
  let activeView = initialView;
  let activeSnapshot = initialSnapshot;
  let activeGridVisible = profile === "editor";
  let requestActiveRender = (time: number) => {
    pendingTime = time;
  };
  let setActiveGridVisible: (visible: boolean) => void = () => undefined;
  let setActiveSnapshot: (snapshot: SceneEngineSnapshot, assetsChanged: boolean) => boolean = () => true;
  let setActiveView: (view: RenderView) => void = () => undefined;

  const initialize = async () => {
    const ownGeneration = ++generation;
    const nextGpu = await init({ label: "fantassist-scene" });
    if (disposed || ownGeneration !== generation) {
      nextGpu.dispose();
      return;
    }
    let nextSurface: Surface | undefined;
    let imageUploads: ImageTextureUpload[] = [];
    try {
      imageUploads = await Promise.all(activeSnapshot.scene.assets.map(async (asset) =>
        (imageLoader ? await imageLoader.loadImage(asset.mediaId) : null) ?? createFallbackImageUpload()
      ));
      if (disposed || ownGeneration !== generation) {
        imageUploads.forEach((upload) => upload.dispose());
        nextGpu.dispose();
        return;
      }
      nextSurface = surface(nextGpu, canvas, { dpr: [1, 2], autoResize: true });
      const executor = createSceneExecutor(
        nextGpu,
        nextSurface,
        createRenderPlan(profile),
        browserSceneShaders,
        activeView,
        activeSnapshot,
        imageUploads
      );
      imageUploads.forEach((upload) => upload.dispose());
      imageUploads = [];
      executor.setGridVisible(activeGridVisible);
      await executor.prewarm();
      if (disposed || ownGeneration !== generation) {
        nextSurface.dispose();
        nextGpu.dispose();
        return;
      }

      stopResize?.();
      targetSurface?.dispose();
      gpu?.dispose();
      gpu = nextGpu;
      targetSurface = nextSurface;
      stopResize = nextSurface.onResize(({ width, height }) => {
        executor.resize([width, height]);
        requestRender(0);
      });
      void nextGpu.gpu.lost.then(() => {
        if (!disposed && ownGeneration === generation) {
          stopResize?.();
          stopResize = undefined;
          targetSurface?.dispose();
          targetSurface = undefined;
          gpu?.dispose();
          gpu = undefined;
          void initialize().catch((error: unknown) => {
            console.error("Unable to recover the v2 renderer", error);
            onFatalError?.(error);
          });
        }
      });
      requestActiveRender = requestRender;
      setActiveGridVisible = (visible: boolean) => executor.setGridVisible(visible);
      let replacementRevision = 0;
      let replacementQueue = Promise.resolve();
      setActiveSnapshot = (snapshot: SceneEngineSnapshot, assetsChanged: boolean) => {
        if (!assetsChanged) {
          executor.setSnapshot(snapshot);
          return true;
        }
        const ownReplacement = ++replacementRevision;
        replacementQueue = replacementQueue.then(async () => {
          if (disposed || ownGeneration !== generation || ownReplacement !== replacementRevision) return;
          const uploads = await Promise.all(snapshot.scene.assets.map(async (asset) =>
            (imageLoader ? await imageLoader.loadImage(asset.mediaId) : null) ?? createFallbackImageUpload()
          ));
          if (disposed || ownGeneration !== generation || ownReplacement !== replacementRevision) {
            uploads.forEach((upload) => upload.dispose());
            return;
          }
          try {
            await executor.replaceAssets(snapshot, uploads);
            executor.setSnapshot(activeSnapshot);
          } finally {
            uploads.forEach((upload) => upload.dispose());
          }
          if (!disposed && ownGeneration === generation && ownReplacement === replacementRevision) {
            requestRender(lastTime);
          }
        }).catch((error: unknown) => {
          console.error("Unable to replace v2 image assets", error);
          onFatalError?.(error);
        });
        return false;
      };
      setActiveView = (view: RenderView) => executor.setView(view);
      requestRender(0);

      let rendering = false;
      async function drain() {
        if (rendering || disposed || ownGeneration !== generation) return;
        rendering = true;
        try {
          while (pendingTime !== undefined && !disposed && ownGeneration === generation) {
            const time = pendingTime;
            pendingTime = undefined;
            await executor.render(time);
          }
        } catch (error) {
          console.error("Unable to render the v2 scene", error);
          onFatalError?.(error);
        } finally {
          rendering = false;
        }
      }

      function requestRender(time: number) {
        pendingTime = time;
        queueMicrotask(() => void drain());
      }
    } catch (error) {
      imageUploads.forEach((upload) => upload.dispose());
      nextSurface?.dispose();
      nextGpu.dispose();
      throw error;
    }
  };

  try {
    await initialize();
  } catch (error) {
    disposed = true;
    stopResize?.();
    targetSurface?.dispose();
    gpu?.dispose();
    throw error;
  }

  const render = (time = 0) => {
    if (!disposed) {
      lastTime = time;
      requestActiveRender(time);
    }
  };
  const resizeObserver = new ResizeObserver(() => render(lastTime));
  const handleWindowResize = () => render(lastTime);
  resizeObserver.observe(canvas);
  window.addEventListener("resize", handleWindowResize);

  return {
    render,
    setGridVisible(visible) {
      if (disposed) return;
      activeGridVisible = visible;
      setActiveGridVisible(visible);
      render(lastTime);
    },
    setSnapshot(nextSnapshot) {
      if (disposed) return;
      const assetsChanged = assetKey(activeSnapshot) !== assetKey(nextSnapshot);
      activeSnapshot = nextSnapshot;
      if (setActiveSnapshot(nextSnapshot, assetsChanged)) render(lastTime);
    },
    setView(view) {
      if (disposed) return;
      activeView = view;
      setActiveView(view);
      render(lastTime);
    },
    startAnimation(fps = 30) {
      let active = true;
      let previousFrame = 0;
      const interval = 1_000 / fps;
      const tick = (now: number) => {
        if (!active || disposed) return;
        if (now - previousFrame >= interval) {
          previousFrame = now;
          render(now / 1_000);
        }
        animationFrame = requestAnimationFrame(tick);
      };
      animationFrame = requestAnimationFrame(tick);
      return () => {
        active = false;
        if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      requestActiveRender = () => undefined;
      setActiveGridVisible = () => undefined;
      setActiveSnapshot = () => true;
      setActiveView = () => undefined;
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      stopResize?.();
      targetSurface?.dispose();
      gpu?.dispose();
    },
  };

}

function assetKey(snapshot: SceneEngineSnapshot): string {
  return snapshot.scene.assets.map((asset) => `${asset.id}:${asset.mediaId}`).join("|");
}
