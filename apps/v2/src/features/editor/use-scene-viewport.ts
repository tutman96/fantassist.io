"use client";

import { useEffect, useRef, useState } from "react";

import type { SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import type { TableSession, TableSessionSnapshot } from "@/engine/table-session";
import type { RenderView } from "@/renderer/projection";
import type { RenderProfile } from "@/renderer/scene-renderer";
import { createBrowserSceneRenderer } from "@/renderer/vgpu/browser-renderer";

export type RendererStatus = "starting" | "ready" | "unsupported";

export function useSceneViewport({
  canvasRef,
  engine,
  profile,
  sceneSnapshot,
  session,
  tableSnapshot,
}: {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly engine: SceneEngine;
  readonly profile: RenderProfile;
  readonly sceneSnapshot: SceneEngineSnapshot;
  readonly session: TableSession;
  readonly tableSnapshot: TableSessionSnapshot;
}): RendererStatus {
  const rendererRef = useRef<Awaited<ReturnType<typeof createBrowserSceneRenderer>>>(null);
  const [status, setStatus] = useState<RendererStatus>("starting");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateViewport = () => {
      const bounds = canvas.getBoundingClientRect();
      session.setViewport({ width: bounds.width, height: bounds.height });
    };
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, session]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let disposeRenderer: (() => void) | undefined;

    queueMicrotask(() => {
      if (disposed) return;
      const initialView = toRenderView(profile, session.getSnapshot());
      void createBrowserSceneRenderer(canvas, profile, initialView, engine.getSnapshot(), () => {
        if (!disposed) setStatus("unsupported");
      })
        .then((renderer) => {
          if (disposed) {
            renderer.dispose();
            return;
          }
          rendererRef.current = renderer;
          disposeRenderer = () => {
            rendererRef.current = null;
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
  }, [canvasRef, engine, profile, session]);

  useEffect(() => {
    rendererRef.current?.setView(toRenderView(profile, tableSnapshot));
    rendererRef.current?.setGridVisible(
      profile === "editor" ? tableSnapshot.editorGridVisible : tableSnapshot.table.displayGrid
    );
    rendererRef.current?.setSnapshot(sceneSnapshot);
  }, [profile, sceneSnapshot, tableSnapshot, status]);

  return status;
}

function toRenderView(profile: RenderProfile, snapshot: TableSessionSnapshot): RenderView {
  return profile === "editor"
    ? {
        kind: "editor",
        camera: snapshot.editorCamera,
        viewportCss: snapshot.viewportCss,
        table: snapshot.table,
        display: snapshot.display,
      }
    : { kind: "output", table: snapshot.table, display: snapshot.display };
}
