"use client";

import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from "react";

import { createSceneEngine } from "@/engine/scene-engine";
import type { SceneEngine } from "@/engine/scene-engine";
import { createSampleSceneDocument } from "@/engine/scene-document";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { createV1Repositories } from "@/persistence/v1/repositories";
import type { V1Repositories } from "@/persistence/v1/repositories";
import { patchV1SceneTransforms, projectV1Scene } from "@/persistence/v1/scene-adapter";
import { SceneConflictError } from "@/persistence/v1/types";
import type { V1Campaign, V1SceneRecord } from "@/persistence/v1/types";
import { createBrowserImageLoader } from "@/renderer/browser-image-loader";
import type { ImageAssetLoader } from "@/renderer/image-texture";

export interface SceneCatalogItem {
  readonly key: string;
  readonly campaignId: string;
  readonly name: string;
  readonly version: number;
  readonly prototype: boolean;
}

export type ScenePersistenceStatus = "loading" | "prototype" | "saved" | "saving" | "conflict" | "error";

interface EditorSceneContextValue {
  readonly engine: SceneEngine;
  readonly imageLoader: ImageAssetLoader;
  readonly campaigns: readonly V1Campaign[];
  readonly scenes: readonly SceneCatalogItem[];
  readonly activeSceneKey: string;
  readonly status: ScenePersistenceStatus;
  readonly error: string | null;
  selectScene(key: string): Promise<void>;
}

const EditorSceneContext = createContext<EditorSceneContextValue | null>(null);

export function EditorSceneProvider({ children }: { readonly children: React.ReactNode }) {
  const tableSession = useSharedTableSession();
  const [engine] = useState(createSceneEngine);
  const [repositories] = useState<V1Repositories>(createV1Repositories);
  const [imageLoader] = useState(() => createBrowserImageLoader((id) => repositories.getAsset(id)));
  const [campaigns, setCampaigns] = useState<readonly V1Campaign[]>([]);
  const [scenes, setScenes] = useState<readonly SceneCatalogItem[]>([
    { key: "sample/scene", campaignId: "sample", name: "Astral Clearing", version: 0, prototype: true },
  ]);
  const [activeSceneKey, setActiveSceneKey] = useState("sample/scene");
  const [status, setStatus] = useState<ScenePersistenceStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const activeRecord = useRef<V1SceneRecord | null>(null);
  const savedEngineRevision = useRef(0);
  const generation = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const unsubscribeExternal = useRef<() => void>(() => undefined);
  const hydrating = useRef(false);

  const hydrate = (record: V1SceneRecord) => {
    const document = projectV1Scene(record.scene);
    if (!document) throw new Error("This scene does not contain a supported image asset yet");
    hydrating.current = true;
    activeRecord.current = record;
    savedEngineRevision.current = document.version;
    engine.replaceCommittedScene(document, document.version);
    if (record.scene.table && tableSession) {
      tableSession.updateConfiguration({
        table: {
          originGrid: record.scene.table.offset ?? { x: 0, y: 0 },
          scale: record.scene.table.scale || 1,
          displayGrid: record.scene.table.displayGrid,
        },
      });
      tableSession.fitTable();
    }
    hydrating.current = false;
  };

  const watchExternalChanges = (key: string, ownGeneration: number) => {
    unsubscribeExternal.current();
    unsubscribeExternal.current = repositories.subscribeScene(key, () => {
      void repositories.loadScene(key).then((latest) => {
        if (!latest || generation.current !== ownGeneration) return;
        const current = activeRecord.current;
        if (!current || latest.scene.version === current.scene.version) return;
        if (engine.getSnapshot().revision > savedEngineRevision.current) {
          setStatus("conflict");
          setError("This scene changed in another Fantassist tab. Reload it before continuing.");
          return;
        }
        hydrate(latest);
        setStatus("saved");
      }).catch((cause: unknown) => {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Unable to reload the changed scene");
      });
    });
  };

  const selectScene = async (key: string) => {
    if (key === "sample/scene") {
      generation.current++;
      unsubscribeExternal.current();
      activeRecord.current = null;
      hydrating.current = true;
      engine.replaceCommittedScene(createSampleSceneDocument(), 0);
      savedEngineRevision.current = 0;
      hydrating.current = false;
      setActiveSceneKey(key);
      setStatus("prototype");
      return;
    }
    const ownGeneration = ++generation.current;
    setStatus("loading");
    setError(null);
    try {
      const record = await repositories.loadScene(key);
      if (!record || generation.current !== ownGeneration) return;
      hydrate(record);
      setActiveSceneKey(key);
      setStatus("saved");
      watchExternalChanges(key, ownGeneration);
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Unable to open the scene");
    }
  };
  const selectSceneForInitialization = useEffectEvent(selectScene);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repositories.listCampaigns(),
      repositories.listScenes(),
      repositories.getSetting<string>("displayed_scene"),
      repositories.getSetting<{ width: number; height: number }>("table_resolution"),
      repositories.getSetting<number>("table_size"),
    ]).then(async ([campaignValues, sceneRecords, displayedScene, resolution, diagonal]) => {
      if (cancelled) return;
      setCampaigns(campaignValues);
      if (resolution && tableSession) tableSession.updateConfiguration({ display: { resolutionPx: resolution } });
      if (diagonal && tableSession) tableSession.updateConfiguration({ display: { diagonalInches: diagonal } });
      if (sceneRecords.length === 0) {
        setStatus("prototype");
        return;
      }
      const catalog = sceneRecords.map((record) => ({
        key: record.key,
        campaignId: record.campaignId,
        name: record.scene.name,
        version: record.scene.version,
        prototype: false,
      }));
      setScenes(catalog);
      const preferred = sceneRecords.find((record) => record.key === displayedScene)
        ?? sceneRecords.find((record) => projectV1Scene(record.scene) !== null);
      if (preferred) await selectSceneForInitialization(preferred.key);
      else {
        setStatus("error");
        setError("No stored scene contains a supported image asset");
      }
    }).catch((cause: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Unable to read Fantassist storage");
    });
    return () => {
      cancelled = true;
      unsubscribeExternal.current();
    };
  }, [repositories, tableSession]);

  useEffect(() => engine.subscribe(() => {
    if (hydrating.current || status === "conflict") return;
    const record = activeRecord.current;
    const committed = engine.getCommittedSnapshot();
    if (!record || committed.revision <= savedEngineRevision.current) return;
    const ownGeneration = generation.current;
    setStatus("saving");
    saveQueue.current = saveQueue.current.then(async () => {
      if (generation.current !== ownGeneration) return;
      const currentRecord = activeRecord.current;
      if (!currentRecord) return;
      const nextVersion = currentRecord.scene.version + 1;
      const nextScene = patchV1SceneTransforms(currentRecord.scene, committed.scene, nextVersion);
      const saved = await repositories.saveScene(
        { ...currentRecord, scene: nextScene },
        currentRecord.scene.version
      );
      activeRecord.current = saved;
      savedEngineRevision.current = committed.revision;
      if (engine.getSnapshot().revision === committed.revision) setStatus("saved");
    }).catch((cause: unknown) => {
      if (cause instanceof SceneConflictError) {
        setStatus("conflict");
      } else {
        setStatus("error");
      }
      setError(cause instanceof Error ? cause.message : "Unable to save the scene");
    });
  }), [engine, repositories, status]);

  return (
    <EditorSceneContext value={{ engine, imageLoader, campaigns, scenes, activeSceneKey, status, error, selectScene }}>
      {children}
    </EditorSceneContext>
  );
}

export function useEditorScene(): EditorSceneContextValue | null {
  return useContext(EditorSceneContext);
}
