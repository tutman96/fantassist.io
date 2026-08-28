"use client";

import { useEffect, useRef, useState } from "react";

import { createBrowserSceneRenderer } from "@/renderer/vgpu/browser-renderer";
import type { RenderProfile } from "@/renderer/scene-renderer";

type RendererStatus = "starting" | "ready" | "unsupported";

export function GpuViewport({ profile }: { profile: RenderProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Awaited<ReturnType<typeof createBrowserSceneRenderer>>>(null);
  const [status, setStatus] = useState<RendererStatus>("starting");
  const [gridVisible, setGridVisible] = useState(profile === "editor");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let disposeRenderer: (() => void) | undefined;

    queueMicrotask(() => {
      if (disposed) return;
      void createBrowserSceneRenderer(canvas, profile, () => {
        if (!disposed) setStatus("unsupported");
      })
        .then((renderer) => {
          if (disposed) {
            renderer.dispose();
            return;
          }
          const stopAnimation = renderer.startAnimation(30);
          rendererRef.current = renderer;
          renderer.setGridVisible(profile === "editor");
          setGridVisible(profile === "editor");
          disposeRenderer = () => {
            rendererRef.current = null;
            stopAnimation();
            renderer.dispose();
          };
          setStatus("ready");
        })
        .catch((error: unknown) => {
          console.error("Unable to initialize the v2 renderer", error);
          if (!disposed) setStatus("unsupported");
        });
    });

    return () => {
      disposed = true;
      disposeRenderer?.();
    };
  }, [profile]);

  return (
    <div className="relative min-h-0 flex-1 bg-black">
      <canvas
        ref={canvasRef}
        aria-label="Fantassist WebGPU renderer preview"
        className="block size-full min-h-[30rem]"
      />
      {status !== "ready" ? (
        <div className="absolute inset-0 grid place-items-center bg-background/85 p-8 text-center backdrop-blur-sm">
          <div>
            <p className="text-sm font-medium">
              {status === "starting"
                ? "Starting WebGPU..."
                : "WebGPU is unavailable"}
            </p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
              {status === "starting"
                ? "Prewarming the multipass vgpu scene pipeline."
                : "Use a WebGPU-capable browser to run the Fantassist v2 renderer."}
            </p>
          </div>
        </div>
      ) : profile === "editor" ? (
        <button
          type="button"
          aria-pressed={gridVisible}
          className="absolute right-3 bottom-3 rounded-md border border-white/20 bg-black/75 px-3 py-1.5 font-mono text-[0.65rem] tracking-wider text-white uppercase backdrop-blur-sm hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={() => {
            const visible = !gridVisible;
            setGridVisible(visible);
            rendererRef.current?.setGridVisible(visible);
          }}
        >
          Grid {gridVisible ? "on" : "off"}
        </button>
      ) : null}
    </div>
  );
}
