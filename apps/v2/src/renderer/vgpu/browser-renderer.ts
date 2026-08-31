import { init, surface } from "vgpu";
import type { Gpu, Surface } from "vgpu";

import type { SceneEngineSnapshot } from "../../engine/scene-engine";
import { hasVisibleAnimatedEffects } from "../animation-demand";
import { effectGeometryKey } from "../effect-resource-key";
import { SerializedExecutorScheduler } from "../executor-scheduler";
import { createFallbackImageUpload } from "../image-texture";
import type { ImageAssetLoader, ImageTextureUpload } from "../image-texture";
import { createRenderPlan } from "../render-plan";
import type { RenderView } from "../projection";
import type { RenderProfile } from "../scene-renderer";
import { browserSceneShaders } from "./browser-shaders";
import { createSceneExecutor } from "./scene-executor";
import type { SceneShaders } from "./scene-shaders";

export interface BrowserSceneRenderer {
  render(time?: number): void;
  setGridVisible(visible: boolean): void;
  setTableEditing(editing: boolean): void;
  setSnapshot(snapshot: SceneEngineSnapshot): void;
  setView(view: RenderView): void;
  dispose(): void;
}

export async function createBrowserSceneRenderer(
  canvas: HTMLCanvasElement,
  profile: RenderProfile,
  initialView: RenderView,
  initialSnapshot: SceneEngineSnapshot,
  imageLoader?: ImageAssetLoader,
  shaders: SceneShaders = browserSceneShaders,
  onFatalError?: (error: unknown) => void
): Promise<BrowserSceneRenderer> {
  let disposed = false;
  let gpu: Gpu | undefined;
  let targetSurface: Surface | undefined;
  let stopResize: (() => void) | undefined;
  let stopExecutorOperations: (() => Promise<void>) | undefined;
  let generation = 0;
  let lastTime = 0;
  let animationFrame: number | undefined;
  let animationTime = 0;
  let previousAnimationFrame: number | undefined;
  let pendingEffectTransition = false;
  let pendingTime: number | undefined;
  let activeView = initialView;
  let activeSnapshot = initialSnapshot;
  let activeGridVisible = profile === "editor";
  let activeTableEditing = false;
  let requestActiveRender = (time: number) => {
    pendingTime = time;
  };
  let setActiveGridVisible: (visible: boolean) => void = () => undefined;
  let setActiveTableEditing: (editing: boolean) => void = () => undefined;
  let setActiveSnapshot: (snapshot: SceneEngineSnapshot) => void = () => undefined;
  let setActiveView: (view: RenderView) => void = () => undefined;
  let hasActiveAnimation = () => false;
  const animationInterval = profile === "editor" ? 1_000 / 30 : 0;
  const animationNeeded = () => pendingEffectTransition || hasVisibleAnimatedEffects(activeSnapshot.scene) || hasActiveAnimation();

  const stopAnimationFrame = () => {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
    previousAnimationFrame = undefined;
  };
  const tickAnimation = (now: number) => {
    animationFrame = undefined;
    if (disposed || document.hidden || !animationNeeded()) {
      previousAnimationFrame = undefined;
      return;
    }
    if (previousAnimationFrame === undefined) previousAnimationFrame = now;
    const elapsed = now - previousAnimationFrame;
    if (elapsed >= animationInterval) {
      animationTime += elapsed / 1_000;
      previousAnimationFrame = now;
      lastTime = animationTime;
      requestActiveRender(animationTime);
    }
    animationFrame = requestAnimationFrame(tickAnimation);
  };
  const updateAnimationDemand = () => {
    if (disposed || document.hidden || !animationNeeded()) {
      stopAnimationFrame();
    } else if (animationFrame === undefined) {
      animationFrame = requestAnimationFrame(tickAnimation);
    }
  };
  const handleVisibilityChange = () => {
    updateAnimationDemand();
    if (!document.hidden) {
      lastTime = animationTime;
      requestActiveRender(animationTime);
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

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
        shaders,
        activeView,
        activeSnapshot,
        imageUploads
      );
      imageUploads.forEach((upload) => upload.dispose());
      imageUploads = [];
      executor.setGridVisible(activeGridVisible);
      executor.setTableEditing(activeTableEditing);
      await executor.prewarm();
      if (disposed || ownGeneration !== generation) {
        nextSurface.dispose();
        nextGpu.dispose();
        return;
      }

      await stopExecutorOperations?.();
      stopResize?.();
      targetSurface?.dispose();
      gpu?.dispose();
      gpu = nextGpu;
      targetSurface = nextSurface;
      let appliedAssets = activeSnapshot;
      let appliedFog = activeSnapshot;
      let appliedEffects = activeSnapshot;
      const resourcesCurrent = (snapshot: SceneEngineSnapshot) =>
        assetKey(appliedAssets) === assetKey(snapshot)
        && fogKey(appliedFog) === fogKey(snapshot)
        && effectGeometryKey(appliedEffects) === effectGeometryKey(snapshot);
      const executorScheduler = new SerializedExecutorScheduler({
        resourcesCurrent,
        async synchronizeResources(snapshot, isCurrent) {
          const assetsChanged = assetKey(appliedAssets) !== assetKey(snapshot);
          const uploads = assetsChanged
            ? await Promise.all(snapshot.scene.assets.map(async (asset) =>
                (imageLoader ? await imageLoader.loadImage(asset.mediaId) : null) ?? createFallbackImageUpload()
              ))
            : [];
          try {
            if (!isCurrent()) return false;
            if (assetsChanged) {
              await executor.replaceAssets(snapshot, uploads);
              appliedAssets = snapshot;
              if (!isCurrent()) return false;
            }
            if (fogKey(appliedFog) !== fogKey(snapshot)) {
              await executor.replaceFog(snapshot);
              appliedFog = snapshot;
              if (!isCurrent()) return false;
            }
            if (effectGeometryKey(appliedEffects) !== effectGeometryKey(snapshot)) {
              await executor.replaceEffects(snapshot);
              appliedEffects = snapshot;
              if (!isCurrent()) return false;
            }
            return resourcesCurrent(snapshot);
          } finally {
            uploads.forEach((upload) => upload.dispose());
          }
        },
        resize: (size) => executor.resize(size),
        setView: (view) => executor.setView(view),
        setGridVisible: (visible) => executor.setGridVisible(visible),
        setTableEditing: (editing) => executor.setTableEditing(editing),
        setSnapshot(snapshot) {
          executor.setSnapshot(snapshot);
          pendingEffectTransition = false;
          updateAnimationDemand();
        },
        render: (time) => executor.render(time),
      }, {
        snapshot: activeSnapshot,
        view: activeView,
        gridVisible: activeGridVisible,
        tableEditing: activeTableEditing,
      }, (error) => {
        console.error("Unable to update the v2 renderer", error);
        onFatalError?.(error);
      });
      stopExecutorOperations = () => {
        executorScheduler.dispose();
        return executorScheduler.settled();
      };
      stopResize = nextSurface.onResize(({ width, height }) => {
        executorScheduler.resize([width, height]);
        executorScheduler.requestRender(lastTime);
      });
      void nextGpu.gpu.lost.then(async () => {
        if (!disposed && ownGeneration === generation) {
          executorScheduler.dispose();
          await executorScheduler.settled();
          if (disposed || ownGeneration !== generation) return;
          stopExecutorOperations = undefined;
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
      requestActiveRender = (time) => executorScheduler.requestRender(time);
      hasActiveAnimation = () => executor.hasAnimationDemand();
      setActiveGridVisible = (visible) => executorScheduler.setGridVisible(visible);
      setActiveTableEditing = (editing) => executorScheduler.setTableEditing(editing);
      setActiveSnapshot = (snapshot) => executorScheduler.setSnapshot(snapshot);
      setActiveView = (view) => executorScheduler.setView(view);
      executorScheduler.requestRender(pendingTime ?? lastTime);
      pendingTime = undefined;
      updateAnimationDemand();
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
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    stopAnimationFrame();
    stopResize?.();
    targetSurface?.dispose();
    gpu?.dispose();
    throw error;
  }

  const render = (time = lastTime) => {
    if (!disposed) {
      lastTime = Math.max(lastTime, time);
      animationTime = Math.max(animationTime, lastTime);
      requestActiveRender(lastTime);
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
    setTableEditing(editing) {
      if (disposed) return;
      activeTableEditing = editing;
      setActiveTableEditing(editing);
      render(lastTime);
    },
    setSnapshot(nextSnapshot) {
      if (disposed) return;
      if (hasVisibleAnimatedEffects(activeSnapshot.scene) && !hasVisibleAnimatedEffects(nextSnapshot.scene)) {
        pendingEffectTransition = true;
      }
      activeSnapshot = nextSnapshot;
      setActiveSnapshot(nextSnapshot);
      render(lastTime);
      updateAnimationDemand();
    },
    setView(view) {
      if (disposed) return;
      activeView = view;
      setActiveView(view);
      render(lastTime);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      const executorSettled = stopExecutorOperations?.() ?? Promise.resolve();
      stopExecutorOperations = undefined;
      requestActiveRender = () => undefined;
      setActiveGridVisible = () => undefined;
      setActiveTableEditing = () => undefined;
      setActiveSnapshot = () => undefined;
      setActiveView = () => undefined;
      hasActiveAnimation = () => false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopAnimationFrame();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      stopResize?.();
      const disposingSurface = targetSurface;
      const disposingGpu = gpu;
      targetSurface = undefined;
      gpu = undefined;
      void executorSettled.finally(() => {
        disposingSurface?.dispose();
        disposingGpu?.dispose();
      });
    },
  };

}

function assetKey(snapshot: SceneEngineSnapshot): string {
  return snapshot.scene.assets.map((asset) => `${asset.id}:${asset.mediaId}`).join("|");
}

function fogKey(snapshot: SceneEngineSnapshot): string {
  return [
    snapshot.selectedFogPolygon?.layerId ?? "",
    snapshot.selectedFogPolygon?.collection ?? "",
    snapshot.selectedFogPolygon?.polygonIndex ?? -1,
    ...snapshot.scene.layers.flatMap((layer) => layer.type === "fog" ? [
    layer.id,
    ...layer.fogPolygons.flatMap((polygon) => [polygon.visibleOnTable ? "1" : "0", ...polygon.vertices.flatMap((vertex) => [vertex.x, vertex.y])]),
    "/",
    ...layer.fogClearPolygons.flatMap((polygon) => [polygon.visibleOnTable ? "1" : "0", ...polygon.vertices.flatMap((vertex) => [vertex.x, vertex.y])]),
    "/walls/",
    ...layer.obstructionPolygons.flatMap((polygon) => [polygon.visibleOnTable ? "1" : "0", ...polygon.vertices.flatMap((vertex) => [vertex.x, vertex.y])]),
    "/lights/",
    layer.lightSources.length,
    ] : []),
  ].join(":");
}
