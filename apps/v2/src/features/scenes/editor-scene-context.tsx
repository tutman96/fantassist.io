"use client";

import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from "react";

import { createSceneEngine } from "@/engine/scene-engine";
import type { SceneEngine } from "@/engine/scene-engine";
import type { GridPoint } from "@/engine/table-camera";
import { createSampleSceneDocument } from "@/engine/scene-document";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { createV1Repositories } from "@/persistence/v1/repositories";
import type { V1Repositories } from "@/persistence/v1/repositories";
import { hydrateAssetDisplayNames, patchV1SceneTransforms, projectV1Scene } from "@/persistence/v1/scene-adapter";
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
  getAssetFile(assetId: string): Promise<File | null>;
  selectScene(key: string): Promise<void>;
  createAssetLayer(): void;
  uploadImages(files: readonly File[], placement: { readonly centerGrid: GridPoint; readonly heightGrid: number; readonly layerId: string }): Promise<void>;
}

const EditorSceneContext = createContext<EditorSceneContextValue | null>(null);

export function EditorSceneProvider({ children }: { readonly children: React.ReactNode }) {
  const tableSession = useSharedTableSession();
  const [engine] = useState(createSceneEngine);
  const [repositories] = useState<V1Repositories>(createV1Repositories);
  const [imageLoader] = useState(() => createBrowserImageLoader((id) => repositories.getAsset(id)));
  const [getAssetFile] = useState(() => (id: string) => repositories.getAsset(id));
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

  const hydrate = async (record: V1SceneRecord) => {
    const projected = projectV1Scene(record.scene);
    if (!projected) throw new Error("This scene does not contain a supported image asset yet");
    const document = await hydrateAssetDisplayNames(projected, (id) => repositories.getAsset(id));
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
      void repositories.loadScene(key).then(async (latest) => {
        if (!latest || generation.current !== ownGeneration) return;
        const current = activeRecord.current;
        if (!current || latest.scene.version === current.scene.version) return;
        if (engine.getSnapshot().revision > savedEngineRevision.current) {
          setStatus("conflict");
          setError("This scene changed in another Fantassist tab. Reload it before continuing.");
          return;
        }
        await hydrate(latest);
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
      await hydrate(record);
      setActiveSceneKey(key);
      setStatus("saved");
      watchExternalChanges(key, ownGeneration);
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Unable to open the scene");
    }
  };
  const uploadImages = async (
    files: readonly File[],
    placement: { readonly centerGrid: GridPoint; readonly heightGrid: number; readonly layerId: string }
  ) => {
    if (status === "conflict") throw new Error("Resolve the scene conflict before uploading media");
    const existingRecord = activeRecord.current;
    const campaignId = existingRecord?.campaignId ?? crypto.randomUUID();
    const layerId = existingRecord ? placement.layerId : crypto.randomUUID();
    if (!layerId) throw new Error("This scene does not have an asset layer");
    if (existingRecord && !engine.getSnapshot().scene.layers.some((layer) => layer.id === layerId && layer.type === "assets")) {
      throw new Error(`Unknown asset layer '${layerId}'`);
    }
    const prepared = [];
    for (const [index, file] of files.entries()) {
      if (!file.type.startsWith("image/")) throw new Error(`Unsupported media type '${file.type || "unknown"}'`);
      const dimensions = await readImageDimensions(file);
      const id = `${campaignId}/${crypto.randomUUID()}`;
      const height = Math.max(0.25, placement.heightGrid);
      const width = height * dimensions.width / dimensions.height;
      prepared.push({
        file,
        asset: {
          id,
          layerId,
          mediaId: id,
          name: file.name.replace(/\.[^.]+$/, "") || "Uploaded image",
          type: "image" as const,
          visible: true,
          intrinsicSize: dimensions,
          transform: {
            x: placement.centerGrid.x - width / 2 + index,
            y: placement.centerGrid.y - height / 2 + index,
            rotation: 0,
            width,
            height,
          },
        },
      });
    }

    if (!existingRecord) {
      const key = `${campaignId}/${crypto.randomUUID()}`;
      const table = tableSession?.getSnapshot().table;
      const sceneName = prepared[0]?.asset.name || "Untitled Scene";
      const record: V1SceneRecord = {
        key,
        campaignId,
        scene: {
          id: key,
          name: sceneName,
          version: 0,
          table: {
            displayGrid: table?.displayGrid ?? false,
            offset: table?.originGrid ?? { x: 0, y: 0 },
            rotation: 0,
            scale: table?.scale ?? 1,
          },
          layers: [{
            assetLayer: {
              id: layerId,
              name: "Assets",
              visible: true,
              type: 0,
              assets: Object.fromEntries(prepared.map(({ asset }) => [asset.id, {
                id: asset.id,
                type: 0,
                size: asset.intrinsicSize,
                transform: asset.transform,
              }])),
            },
          }],
        },
      };
      try {
        for (const item of prepared) await repositories.putAsset(item.asset.id, item.file);
        const campaign = { id: campaignId, name: "Local Campaign" };
        await repositories.putCampaign(campaign);
        await repositories.createScene(record);
        const ownGeneration = ++generation.current;
        setCampaigns((current) => [...current, campaign]);
        setScenes([{ key, campaignId, name: sceneName, version: 0, prototype: false }]);
        await hydrate(record);
        const selectedAsset = prepared.at(-1)?.asset;
        if (selectedAsset) engine.dispatch({ type: "selection.set", assetId: selectedAsset.id });
        setActiveSceneKey(key);
        setStatus("saved");
        setError(null);
        watchExternalChanges(key, ownGeneration);
        return;
      } catch (cause) {
        await Promise.all(prepared.map((item) => repositories.removeAsset(item.asset.id)));
        throw cause;
      }
    }

    const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layerId);
    if (!layer) throw new Error("This scene does not have an asset layer");
    for (const { file, asset } of prepared) {
      await repositories.putAsset(asset.id, file);
      const result = engine.dispatch({
        type: "asset.insert",
        asset,
      });
      if (!result.ok) {
        await repositories.removeAsset(asset.id);
        throw new Error(result.error);
      }
    }
  };
  const createAssetLayer = () => {
    if (!activeRecord.current) throw new Error("Upload an image to create a persisted scene first");
    if (status === "conflict") throw new Error("Resolve the scene conflict before adding a layer");
    const count = engine.getSnapshot().scene.layers.filter((layer) => layer.type === "assets").length;
    const result = engine.dispatch({
      type: "layer.insert",
      layer: {
        id: crypto.randomUUID(),
        name: `Assets ${count + 1}`,
        type: "assets",
        visible: true,
        assetIds: [],
      },
    });
    if (!result.ok) throw new Error(result.error);
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
      setScenes((current) => current.map((scene) => scene.key === saved.key
        ? { ...scene, version: saved.scene.version }
        : scene));
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
    <EditorSceneContext value={{ engine, imageLoader, campaigns, scenes, activeSceneKey, status, error, getAssetFile, selectScene, createAssetLayer, uploadImages }}>
      {children}
    </EditorSceneContext>
  );
}

export function useEditorScene(): EditorSceneContextValue | null {
  return useContext(EditorSceneContext);
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error(`Image '${file.name}' has invalid dimensions`);
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
