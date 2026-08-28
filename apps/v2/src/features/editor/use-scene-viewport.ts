"use client";

import { useEffect, useRef, useState } from "react";

import type { SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import type { TableSession, TableSessionSnapshot } from "@/engine/table-session";
import type { RenderView } from "@/renderer/projection";
import type { RenderProfile } from "@/renderer/scene-renderer";
import { createBrowserSceneRenderer } from "@/renderer/vgpu/browser-renderer";
import type { ImageAssetLoader } from "@/renderer/image-texture";

export type RendererStatus = "starting" | "ready" | "unsupported";

export function useSceneViewport({
  canvasRef,
  engine,
  imageLoader,
  profile,
  sceneSnapshot,
  session,
  tableSnapshot,
  tableEditing,
}: {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly engine: SceneEngine;
  readonly imageLoader?: ImageAssetLoader;
  readonly profile: RenderProfile;
  readonly sceneSnapshot: SceneEngineSnapshot;
  readonly session: TableSession;
  readonly tableSnapshot: TableSessionSnapshot;
  readonly tableEditing: boolean;
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
      const initialView = toRenderView(profile, session.getSnapshot(), engine.getSnapshot().scene.table);
      void createBrowserSceneRenderer(canvas, profile, initialView, engine.getSnapshot(), imageLoader, () => {
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
  }, [canvasRef, engine, imageLoader, profile, session]);

  useEffect(() => {
    rendererRef.current?.setView(toRenderView(profile, tableSnapshot, sceneSnapshot.scene.table));
    rendererRef.current?.setGridVisible(sceneSnapshot.scene.table.displayGrid);
    rendererRef.current?.setTableEditing(profile === "editor" && tableEditing);
    rendererRef.current?.setSnapshot(sceneSnapshot);
  }, [profile, sceneSnapshot, tableEditing, tableSnapshot, status]);

  return status;
}

function toRenderView(profile: RenderProfile, snapshot: TableSessionSnapshot, table: SceneEngineSnapshot["scene"]["table"]): RenderView {
  return profile === "editor"
    ? {
        kind: "editor",
        camera: snapshot.editorCamera,
        viewportCss: snapshot.viewportCss,
        table,
        display: snapshot.display,
      }
    : { kind: "output", table, display: snapshot.display };
}
