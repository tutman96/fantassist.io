import { effect, frame, init, surface } from "vgpu";

import type { RenderProfile } from "@/renderer/scene-renderer";

import scaffoldShader from "./shaders/scaffold.wgsl";

export interface ScaffoldRenderer {
  render(): void;
  dispose(): void;
}

export async function createScaffoldRenderer(
  canvas: HTMLCanvasElement,
  profile: RenderProfile
): Promise<ScaffoldRenderer> {
  const gpu = await init();
  const target = surface(gpu, canvas, { dpr: [1, 2] });
  const scaffold = effect(gpu, scaffoldShader, {
    label: "fantassist-scaffold",
    set: {
      params: {
        viewport: target.size,
        editor: profile === "editor" ? 1 : 0,
      },
    },
  });
  let disposed = false;
  let requestedFrame: number | undefined;

  function render() {
    if (disposed || requestedFrame !== undefined) return;
    requestedFrame = requestAnimationFrame(() => {
      requestedFrame = undefined;
      scaffold.set({
        params: {
          viewport: target.size,
          editor: profile === "editor" ? 1 : 0,
        },
      });
      frame(gpu, (currentFrame) => {
        currentFrame.pass(
          { target, clear: [0.01, 0.02, 0.04, 1] },
          scaffold
        );
      });
    });
  }

  const stopResize = target.onResize(render);

  return {
    render,
    dispose() {
      disposed = true;
      if (requestedFrame !== undefined) cancelAnimationFrame(requestedFrame);
      stopResize();
      target.dispose();
      gpu.dispose();
    },
  };
}
