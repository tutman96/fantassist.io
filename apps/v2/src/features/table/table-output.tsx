"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { freezeSceneDocument } from "@/engine/scene-document";
import { createSceneEngine } from "@/engine/scene-engine";
import { DEFAULT_TABLE_CAMERA } from "@/engine/table-camera";
import { GpuViewport } from "@/features/editor/gpu-viewport";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { createV1Repositories } from "@/persistence/v1/repositories";
import { applyAssetVisibilityMetadata, hydrateAssetDisplayNames, projectV1Scene } from "@/persistence/v1/scene-adapter";
import { createBrowserImageLoader } from "@/renderer/browser-image-loader";

const WAITING_SCENE_ID = "waiting/table";

export function TableOutput() {
  const session = useSharedTableSession();
  const [repositories] = useState(createV1Repositories);
  const [engine] = useState(() => createSceneEngine(freezeSceneDocument({
    id: WAITING_SCENE_ID,
    name: "Waiting for scene",
    version: 0,
    table: DEFAULT_TABLE_CAMERA,
    layers: [],
    assets: [],
  })));
  const [imageLoader] = useState(() => createBrowserImageLoader((id) => repositories.getAsset(id)));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repositories.getSetting<string>("displayed_scene"),
      repositories.getSetting<{ width: number; height: number }>("table_resolution"),
      repositories.getSetting<number>("table_size"),
    ]).then(async ([sceneKey, resolution, diagonal]) => {
      if (cancelled) return;
      if (session) {
        session.updateConfiguration({
          ...(resolution ? { display: { resolutionPx: resolution, ...(diagonal ? { diagonalInches: diagonal } : {}) } } :
            diagonal ? { display: { diagonalInches: diagonal } } : {}),
        });
      }
      const record = sceneKey ? await repositories.loadScene(sceneKey) : null;
      if (record && !cancelled) {
        const projected = projectV1Scene(record.scene);
        const [named, metadata] = await Promise.all([
          hydrateAssetDisplayNames(projected, (id) => repositories.getAsset(id)),
          repositories.getSceneMetadata(record.key),
        ]);
        if (!cancelled) {
          const document = applyAssetVisibilityMetadata(named, metadata?.assetVisibility);
          engine.replaceCommittedScene(document, document.version);
        }
      }
      if (!cancelled) setReady(true);
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : "Unable to restore the displayed scene");
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [engine, repositories, session]);

  if (!ready) return <TableOutputStatus>Restoring player scene</TableOutputStatus>;
  return (
    <div className="relative size-full">
      <GpuViewport profile="output" engine={engine} imageLoader={imageLoader} />
      {snapshot.scene.id === WAITING_SCENE_ID ? (
        <TableOutputStatus>{error ?? "Waiting for the DM to choose a scene"}</TableOutputStatus>
      ) : null}
    </div>
  );
}

function TableOutputStatus({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black text-center">
      <p className="font-mono text-[10px] tracking-[0.2em] text-violet-100/55 uppercase">{children}</p>
    </div>
  );
}
