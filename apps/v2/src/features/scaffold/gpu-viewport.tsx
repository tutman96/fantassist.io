"use client";

import { useEffect, useRef, useState } from "react";

import { createScaffoldRenderer } from "@/renderer/vgpu/scaffold-renderer";
import type { RenderProfile } from "@/renderer/scene-renderer";

type RendererStatus = "starting" | "ready" | "unsupported";

export function GpuViewport({ profile }: { profile: RenderProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<RendererStatus>("starting");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let disposeRenderer: (() => void) | undefined;

    void createScaffoldRenderer(canvas, profile)
      .then((renderer) => {
        if (disposed) {
          renderer.dispose();
          return;
        }
        disposeRenderer = () => renderer.dispose();
        setStatus("ready");
      })
      .catch((error: unknown) => {
        console.error("Unable to initialize the v2 renderer", error);
        if (!disposed) setStatus("unsupported");
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
                ? "Creating the first vgpu device and render pass."
                : "Use a WebGPU-capable browser to run the Fantassist v2 renderer."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
