"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { createSceneEngine } from "@/engine/scene-engine";
import type { SceneEngine } from "@/engine/scene-engine";
import { createTableSession } from "@/engine/table-session";
import { EditorToolbar } from "@/features/editor/editor-toolbar";
import type { EditorTool } from "@/features/editor/editor-tool";
import { useEditorInteractions } from "@/features/editor/use-editor-interactions";
import { useSceneViewport } from "@/features/editor/use-scene-viewport";
import { CameraStatus, EditorGestureHints, RendererGate } from "@/features/editor/viewport-status";
import { WorkspacePanels } from "@/features/editor/workspace-panels";
import { synchronizeSceneEngine } from "@/features/presentation/scene-session-channel";
import { useEditorScene } from "@/features/scenes/editor-scene-context";
import { synchronizeTableSession } from "@/features/presentation/table-session-channel";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { createV1Repositories } from "@/persistence/v1/repositories";
import { createBrowserImageLoader } from "@/renderer/browser-image-loader";
import type { ImageAssetLoader } from "@/renderer/image-texture";
import type { RenderProfile } from "@/renderer/scene-renderer";

export function GpuViewport({ profile, engine: providedEngine, imageLoader: providedImageLoader }: {
  readonly profile: RenderProfile;
  readonly engine?: SceneEngine;
  readonly imageLoader?: ImageAssetLoader;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sharedSession = useSharedTableSession();
  const editorScene = useEditorScene();
  const [ownedSession] = useState(createTableSession);
  const [tool, setTool] = useState<EditorTool>("assets");
  const session = sharedSession ?? ownedSession;
  const [ownedEngine] = useState(createSceneEngine);
  const [ownedImageLoader] = useState(() => {
    const repositories = createV1Repositories();
    return createBrowserImageLoader((id) => repositories.getAsset(id));
  });
  const engine = providedEngine ?? editorScene?.engine ?? ownedEngine;
  const tableSnapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const sceneSnapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const presentationEnabled = profile === "output" || !editorScene || editorScene.activeSceneKey === editorScene.displayedSceneKey;
  const asset = sceneSnapshot.scene.assets[0];

  useEffect(() => synchronizeTableSession(session, profile), [profile, session]);
  useEffect(() => presentationEnabled
    ? synchronizeSceneEngine(engine, profile)
    : undefined, [engine, presentationEnabled, profile]);

  const status = useSceneViewport({
    canvasRef,
    engine,
    imageLoader: providedImageLoader ?? editorScene?.imageLoader ?? ownedImageLoader,
    profile,
    sceneSnapshot,
    session,
    tableSnapshot,
    tableEditing: tool === "table",
  });
  const { cursor, ...canvasEvents } = useEditorInteractions({
    assetRotation: asset?.transform.rotation ?? 0,
    engine,
    profile,
    session,
    tool,
  });

  return (
    <div className="relative size-full overflow-hidden bg-[#03050d]">
      <canvas
        ref={canvasRef}
        aria-label={profile === "editor" ? "Fantassist scene editor" : "Fantassist table output"}
        data-scene-id={sceneSnapshot.scene.id}
        data-scene-revision={sceneSnapshot.revision}
        data-preview-active={sceneSnapshot.previewActive}
        data-fog-polygons={sceneSnapshot.scene.layers.reduce((count, layer) => count + (layer.type === "fog" ? layer.fogPolygons.length : 0), 0)}
        data-fog-clear-polygons={sceneSnapshot.scene.layers.reduce((count, layer) => count + (layer.type === "fog" ? layer.fogClearPolygons.length : 0), 0)}
        data-asset-x={asset?.transform.x}
        data-asset-y={asset?.transform.y}
        data-asset-width={asset?.transform.width}
        data-asset-height={asset?.transform.height}
        data-asset-rotation={asset?.transform.rotation}
        data-table-origin-x={sceneSnapshot.scene.table.originGrid.x}
        data-table-origin-y={sceneSnapshot.scene.table.originGrid.y}
        data-table-scale={sceneSnapshot.scene.table.scale}
        className="block size-full touch-none"
        style={{ cursor }}
        {...canvasEvents}
      />

      {profile === "editor" ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(59,130,246,0.07),transparent_28%),radial-gradient(circle_at_83%_74%,rgba(217,70,239,0.06),transparent_30%)]" />
          <EditorToolbar
            engine={engine}
            sceneSnapshot={sceneSnapshot}
            session={session}
            tableSnapshot={tableSnapshot}
            tool={tool}
            onToolChange={setTool}
          />
          <WorkspacePanels engine={engine} sceneSnapshot={sceneSnapshot} />
          <EditorGestureHints tool={tool} />
          {status === "ready" ? (
            <CameraStatus sceneSnapshot={sceneSnapshot} tableSnapshot={tableSnapshot} />
          ) : null}
        </>
      ) : null}

      <RendererGate status={status} />
    </div>
  );
}
