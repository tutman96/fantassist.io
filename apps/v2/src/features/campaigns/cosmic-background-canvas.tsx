"use client";

import { useEffect, useRef } from "react";

import { createBrowserCosmicRenderer } from "@/renderer/vgpu/cosmic-background";

export function CosmicBackgroundCanvas({ active = true }: { readonly active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Awaited<ReturnType<typeof createBrowserCosmicRenderer>> | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    rendererRef.current?.setMotionEnabled(active && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let disposeRenderer: () => void = () => undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    queueMicrotask(() => {
      void createBrowserCosmicRenderer(canvas).then((renderer) => {
        if (disposed) {
          renderer.dispose();
          return;
        }
        rendererRef.current = renderer;
        disposeRenderer = () => renderer.dispose();
        const updateMotion = () => renderer.setMotionEnabled(activeRef.current && !media.matches);
        updateMotion();
        media.addEventListener("change", updateMotion);
        const previousDispose = disposeRenderer;
        disposeRenderer = () => {
          rendererRef.current = null;
          media.removeEventListener("change", updateMotion);
          previousDispose();
        };
      }).catch((error: unknown) => {
        console.info("Cosmic campaign background unavailable; using CSS fallback", error);
      });
    });
    return () => {
      disposed = true;
      disposeRenderer();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />;
}
