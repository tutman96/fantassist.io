"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import { createSceneEngine } from "@/engine/scene-engine";
import type { SceneEngine } from "@/engine/scene-engine";
import type { GridPoint } from "@/engine/table-camera";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { createV1Repositories } from "@/persistence/v1/repositories";
import type { V1Repositories } from "@/persistence/v1/repositories";
import { applyAssetVisibilityMetadata, hydrateAssetDisplayNames, patchV1SceneTransforms, projectV1Scene } from "@/persistence/v1/scene-adapter";
import { createBlankV1SceneRecord, prepareV1SceneImport } from "@/persistence/v1/scene-lifecycle";
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
  readonly activeCampaignId: string | null;
  readonly activeSceneKey: string;
  readonly status: ScenePersistenceStatus;
  readonly error: string | null;
  getAssetFile(assetId: string): Promise<File | null>;
  selectCampaign(id: string): Promise<void>;
  createCampaign(name: string): Promise<string>;
  createScene(name: string): Promise<string>;
  importScene(file: File): Promise<string>;
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
  const [scenes, setScenes] = useState<readonly SceneCatalogItem[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeSceneKey, setActiveSceneKey] = useState("");
  const [status, setStatus] = useState<ScenePersistenceStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const activeRecord = useRef<V1SceneRecord | null>(null);
  const savedEngineRevision = useRef(0);
  const generation = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const unsubscribeExternal = useRef<() => void>(() => undefined);
  const hydrating = useRef(false);

  const clearActiveScene = () => {
    generation.current++;
    unsubscribeExternal.current();
    activeRecord.current = null;
    setActiveSceneKey("");
    setStatus("prototype");
    setError(null);
  };

  const hydrate = async (record: V1SceneRecord) => {
    const projected = projectV1Scene(record.scene);
    const [namedDocument, metadata] = await Promise.all([
      hydrateAssetDisplayNames(projected, (id) => repositories.getAsset(id)),
      repositories.getSceneMetadata(record.key),
    ]);
    const document = applyAssetVisibilityMetadata(namedDocument, metadata?.assetVisibility);
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
    const ownGeneration = ++generation.current;
    setStatus("loading");
    setError(null);
    try {
      const record = await repositories.loadScene(key);
      if (!record || generation.current !== ownGeneration) return;
      await hydrate(record);
      setActiveCampaignId(record.campaignId);
      setActiveSceneKey(key);
      setStatus("saved");
      await repositories.putSetting("last_campaign", record.campaignId);
      watchExternalChanges(key, ownGeneration);
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Unable to open the scene");
    }
  };
  const selectCampaign = async (id: string) => {
    if (!campaigns.some((campaign) => campaign.id === id)) throw new Error("Campaign no longer exists");
    setActiveCampaignId(id);
    await repositories.putSetting("last_campaign", id);
  };
  const createCampaign = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Campaign name is required");
    const campaign = { id: crypto.randomUUID(), name: trimmed };
    await repositories.putCampaign(campaign);
    setCampaigns((current) => [...current, campaign].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveCampaignId(campaign.id);
    clearActiveScene();
    await repositories.putSetting("last_campaign", campaign.id);
    return campaign.id;
  };
  const activateCreatedScene = async (record: V1SceneRecord) => {
    setScenes((current) => [...current.filter((scene) => scene.key !== record.key), catalogItem(record)]
      .sort((a, b) => a.name.localeCompare(b.name)));
    await selectScene(record.key);
  };
  const createScene = async (name: string) => {
    if (!activeCampaignId) throw new Error("Choose a campaign before creating a scene");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Scene name is required");
    const record = createBlankV1SceneRecord(activeCampaignId, trimmed);
    await repositories.createScene(record);
    await activateCreatedScene(record);
    return record.key;
  };
  const importScene = async (file: File) => {
    if (!activeCampaignId) throw new Error("Choose a campaign before importing a scene");
    const records = await repositories.listScenes(activeCampaignId);
    const prepared = prepareV1SceneImport(new Uint8Array(await file.arrayBuffer()), activeCampaignId, records);
    const storedIds: string[] = [];
    try {
      for (const item of prepared.files) {
        await repositories.putAsset(item.id, item.file);
        storedIds.push(item.id);
      }
      await repositories.createScene(prepared.record);
    } catch (cause) {
      await Promise.all(storedIds.map((id) => repositories.removeAsset(id)));
      throw cause;
    }
    await activateCreatedScene(prepared.record);
    return prepared.record.key;
  };
  const uploadImages = async (
    files: readonly File[],
    placement: { readonly centerGrid: GridPoint; readonly heightGrid: number; readonly layerId: string }
  ) => {
    if (status === "conflict") throw new Error("Resolve the scene conflict before uploading media");
    const existingRecord = activeRecord.current;
    if (!existingRecord) throw new Error("Create a scene before uploading media");
    const campaignId = existingRecord.campaignId;
    const layerId = placement.layerId;
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
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repositories.listCampaigns(),
      repositories.listScenes(),
      repositories.getSetting<string>("displayed_scene"),
      repositories.getSetting<string>("last_campaign"),
      repositories.getSetting<{ width: number; height: number }>("table_resolution"),
      repositories.getSetting<number>("table_size"),
    ]).then(async ([campaignValues, sceneRecords, displayedScene, lastCampaign, resolution, diagonal]) => {
      if (cancelled) return;
      setCampaigns(campaignValues);
      if (resolution && tableSession) tableSession.updateConfiguration({ display: { resolutionPx: resolution } });
      if (diagonal && tableSession) tableSession.updateConfiguration({ display: { diagonalInches: diagonal } });
      if (campaignValues.length === 0) {
        setStatus("prototype");
        return;
      }
      const catalog = sceneRecords.map(catalogItem);
      setScenes(catalog);
      const campaignId = campaignValues.some((campaign) => campaign.id === lastCampaign)
        ? lastCampaign!
        : sceneRecords.find((record) => record.key === displayedScene)?.campaignId ?? campaignValues[0].id;
      setActiveCampaignId(campaignId);
      setStatus("prototype");
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
      await repositories.putSceneMetadata(saved.key, {
        assetVisibility: Object.fromEntries(committed.scene.assets.map((asset) => [asset.id, asset.visible])),
      });
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
    <EditorSceneContext value={{
      engine,
      imageLoader,
      campaigns,
      scenes,
      activeCampaignId,
      activeSceneKey,
      status,
      error,
      getAssetFile,
      selectCampaign,
      createCampaign,
      createScene,
      importScene,
      selectScene,
      createAssetLayer,
      uploadImages,
    }}>
      {children}
    </EditorSceneContext>
  );
}

function catalogItem(record: V1SceneRecord): SceneCatalogItem {
  return { key: record.key, campaignId: record.campaignId, name: record.scene.name, version: record.scene.version, prototype: false };
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
