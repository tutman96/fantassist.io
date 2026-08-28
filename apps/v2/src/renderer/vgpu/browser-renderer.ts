import { init, surface } from "vgpu";
import type { Gpu, Surface } from "vgpu";

import { createRenderPlan } from "../render-plan";
import type { RenderProfile } from "../scene-renderer";
import { browserSceneShaders } from "./browser-shaders";
import { createSceneExecutor } from "./scene-executor";

export interface BrowserSceneRenderer {
  render(time?: number): void;
  setGridVisible(visible: boolean): void;
  startAnimation(fps?: number): () => void;
  dispose(): void;
}

export async function createBrowserSceneRenderer(
  canvas: HTMLCanvasElement,
  profile: RenderProfile,
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
  let requestActiveRender = (time: number) => {
    pendingTime = time;
  };
  let setActiveGridVisible: (visible: boolean) => void = () => undefined;

  const initialize = async () => {
    const ownGeneration = ++generation;
    const nextGpu = await init({ label: "fantassist-scene" });
    if (disposed || ownGeneration !== generation) {
      nextGpu.dispose();
      return;
    }
    let nextSurface: Surface | undefined;
    try {
      nextSurface = surface(nextGpu, canvas, { dpr: [1, 2], autoResize: true });
      const executor = createSceneExecutor(nextGpu, nextSurface, createRenderPlan(profile), browserSceneShaders);
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
      setActiveGridVisible(visible);
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
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      stopResize?.();
      targetSurface?.dispose();
      gpu?.dispose();
    },
  };

}
