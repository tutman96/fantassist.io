import { init, surface } from "vgpu";
import type { Gpu, Surface } from "vgpu";

import cosmicShader from "./shaders/cosmic-background.wgsl";
import { createCosmicExecutor } from "./cosmic-executor";
import type { CosmicExecutor } from "./cosmic-executor";

const canvasOwners = new WeakMap<HTMLCanvasElement, symbol>();

export interface BrowserCosmicRenderer {
  setMotionEnabled(enabled: boolean): void;
  dispose(): void;
}

export async function createBrowserCosmicRenderer(canvas: HTMLCanvasElement): Promise<BrowserCosmicRenderer> {
  const owner = Symbol("cosmic-canvas-owner");
  canvasOwners.set(canvas, owner);
  const ownsCanvas = () => canvasOwners.get(canvas) === owner;
  let disposed = false;
  let generation = 0;
  let gpu: Gpu | undefined;
  let targetSurface: Surface | undefined;
  let executor: CosmicExecutor | undefined;
  let stopResize: (() => void) | undefined;
  let animationFrame: number | undefined;
  let rendering = false;
  let motionEnabled = true;
  let visible = !document.hidden;
  let intersecting = true;
  const startedAt = performance.now();

  const render = async (time: number) => {
    if (disposed || !ownsCanvas() || rendering || !executor) return;
    rendering = true;
    try {
      await executor.render(motionEnabled ? time : 0);
    } finally {
      rendering = false;
    }
  };

  const stopAnimation = () => {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
  };
  const updateAnimation = () => {
    stopAnimation();
    if (!motionEnabled || !visible || !intersecting || disposed || !ownsCanvas()) {
      void render(0);
      return;
    }
    let previous = 0;
    const tick = (now: number) => {
      if (disposed || !ownsCanvas() || !motionEnabled || !visible || !intersecting) return;
      if (now - previous >= 1_000 / 30) {
        previous = now;
        void render((now - startedAt) / 1_000);
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
  };

  const initialize = async () => {
    const ownGeneration = ++generation;
    const nextGpu = await init({ label: "fantassist-campaign-cosmos" });
    if (disposed || !ownsCanvas() || ownGeneration !== generation) {
      nextGpu.dispose();
      return;
    }
    let nextSurface: Surface | undefined;
    try {
      nextSurface = surface(nextGpu, canvas, { dpr: [1, 2], autoResize: true });
      const nextExecutor = createCosmicExecutor(nextGpu, nextSurface, cosmicShader);
      await nextExecutor.prewarm();
      if (disposed || !ownsCanvas() || ownGeneration !== generation) {
        if (ownsCanvas()) nextSurface.dispose();
        nextGpu.dispose();
        return;
      }
      stopResize?.();
      targetSurface?.dispose();
      gpu?.dispose();
      gpu = nextGpu;
      targetSurface = nextSurface;
      executor = nextExecutor;
      stopResize = nextSurface.onResize(() => queueMicrotask(() => void render(0)));
      void nextGpu.gpu.lost.then(() => {
        if (disposed || !ownsCanvas() || ownGeneration !== generation) return;
        stopResize?.();
        targetSurface?.dispose();
        gpu?.dispose();
        stopResize = undefined;
        targetSurface = undefined;
        executor = undefined;
        gpu = undefined;
        void initialize().catch(() => undefined);
      });
      updateAnimation();
    } catch (error) {
      if (ownsCanvas()) nextSurface?.dispose();
      nextGpu.dispose();
      throw error;
    }
  };

  const handleVisibility = () => {
    visible = !document.hidden;
    updateAnimation();
  };
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    intersecting = entry?.isIntersecting ?? true;
    updateAnimation();
  });
  document.addEventListener("visibilitychange", handleVisibility);
  intersectionObserver.observe(canvas);
  await initialize();

  if (!ownsCanvas()) {
    disposed = true;
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    gpu?.dispose();
    return { setMotionEnabled() {}, dispose() {} };
  }

  return {
    setMotionEnabled(enabled) {
      motionEnabled = enabled;
      updateAnimation();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      stopAnimation();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      stopResize?.();
      if (ownsCanvas()) {
        targetSurface?.dispose();
        canvasOwners.delete(canvas);
      }
      gpu?.dispose();
    },
  };
}
