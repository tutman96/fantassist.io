"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import { createSceneEngine } from "@/engine/scene-engine";
import type { SceneEngine } from "@/engine/scene-engine";
import type { GridPoint } from "@/engine/table-camera";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { createV1Repositories } from "@/persistence/v1/repositories";
import type { V1Repositories } from "@/persistence/v1/repositories";
import { applyAssetVisibilityMetadata, hydrateAssetDisplayNames, patchV1SceneTransforms, projectV1Scene } from "@/persistence/v1/scene-adapter";
import { campaignExportFilename, prepareV1CampaignExport, sceneExportFilename } from "@/persistence/v1/campaign-export";
import { createBlankV1SceneRecord, prepareV1SceneExport, prepareV1SceneImport } from "@/persistence/v1/scene-lifecycle";
import { SceneConflictError } from "@/persistence/v1/types";
import type { V1Campaign, V1SceneRecord } from "@/persistence/v1/types";
import { createBrowserImageLoader } from "@/renderer/browser-image-loader";
import type { ImageAssetLoader } from "@/renderer/image-texture";
import { downloadBlob } from "./download-blob";

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
  readonly displayedSceneKey: string;
  readonly status: ScenePersistenceStatus;
  readonly error: string | null;
  getAssetFile(assetId: string): Promise<File | null>;
  selectCampaign(id: string): Promise<void>;
  createCampaign(name: string): Promise<string>;
  renameCampaign(id: string, name: string): Promise<void>;
  deleteCampaign(id: string): Promise<string | null>;
  createScene(name: string): Promise<string>;
  renameScene(key: string, name: string): Promise<void>;
  deleteScene(key: string): Promise<void>;
  importScene(file: File): Promise<string>;
  exportScene(key: string): Promise<void>;
  exportCampaign(id: string): Promise<void>;
  displayScene(): Promise<void>;
  selectScene(key: string): Promise<void>;
  createAssetLayer(): void;
  createFogLayer(): void;
  createEffectsLayer(): string;
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
  const [displayedSceneKey, setDisplayedSceneKey] = useState("");
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
    if (tableSession) tableSession.fitTable(document.table);
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
    await saveQueue.current;
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
  const displayScene = async () => {
    const key = activeRecord.current?.key;
    if (!key) throw new Error("Open a persisted scene before displaying it");
    await repositories.putSetting("displayed_scene", key);
    setDisplayedSceneKey(key);
  };
  const createCampaign = async (name: string) => {
    const trimmed = validName(name, "Campaign");
    const campaign = { id: crypto.randomUUID(), name: trimmed };
    await repositories.putCampaign(campaign);
    setCampaigns((current) => [...current, campaign].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveCampaignId(campaign.id);
    clearActiveScene();
    await repositories.putSetting("last_campaign", campaign.id);
    return campaign.id;
  };
  const renameCampaign = async (id: string, name: string) => {
    const campaign = campaigns.find((candidate) => candidate.id === id);
    if (!campaign) throw new Error("Campaign no longer exists");
    const trimmed = validName(name, "Campaign");
    if (campaign.name === trimmed) return;
    const renamed = { ...campaign, name: trimmed };
    await repositories.putCampaign(renamed);
    setCampaigns((current) => current.map((candidate) => candidate.id === id ? renamed : candidate)
      .sort((a, b) => a.name.localeCompare(b.name)));
  };
  const activateCreatedScene = async (record: V1SceneRecord) => {
    setScenes((current) => [...current.filter((scene) => scene.key !== record.key), catalogItem(record)]
      .sort((a, b) => a.name.localeCompare(b.name)));
    await selectScene(record.key);
  };
  const createScene = async (name: string) => {
    if (!activeCampaignId) throw new Error("Choose a campaign before creating a scene");
    const trimmed = validName(name, "Scene");
    const record = createBlankV1SceneRecord(activeCampaignId, trimmed);
    await repositories.createScene(record);
    await activateCreatedScene(record);
    return record.key;
  };
  const renameScene = async (key: string, name: string) => {
    const trimmed = validName(name, "Scene");
    if (key === activeSceneKey && activeRecord.current?.key === key) {
      const result = engine.dispatch({ type: "scene.rename", name: trimmed });
      if (!result.ok) throw new Error(result.error);
      setScenes((current) => current.map((scene) => scene.key === key ? { ...scene, name: trimmed } : scene)
        .sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }
    await saveQueue.current;
    const record = await repositories.loadScene(key);
    if (!record) throw new Error("Scene no longer exists");
    if (record.scene.name === trimmed) return;
    const saved = await repositories.saveScene({
      ...record,
      scene: { ...record.scene, name: trimmed, version: record.scene.version + 1 },
    }, record.scene.version);
    setScenes((current) => current.map((scene) => scene.key === key ? catalogItem(saved) : scene)
      .sort((a, b) => a.name.localeCompare(b.name)));
  };

  const deleteScene = async (key: string) => {
    await saveQueue.current;
    const record = await repositories.loadScene(key);
    if (!record) return;
    const remaining = (await repositories.listScenes()).filter((candidate) => candidate.key !== key);
    if (activeRecord.current?.key === key) clearActiveScene();
    await repositories.deleteScene(key);
    await removeUnreferencedAssets([record], remaining, repositories);
    setScenes((current) => current.filter((scene) => scene.key !== key));
    if (displayedSceneKey === key) {
      await repositories.putSetting("displayed_scene", null);
      setDisplayedSceneKey("");
    }
  };

  const deleteCampaign = async (id: string) => {
    await saveQueue.current;
    if (!campaigns.some((campaign) => campaign.id === id)) return activeCampaignId;
    const removed = await repositories.listScenes(id);
    const remaining = (await repositories.listScenes()).filter((record) => record.campaignId !== id);
    if (activeRecord.current?.campaignId === id) clearActiveScene();
    for (const record of removed) await repositories.deleteScene(record.key);
    await removeUnreferencedAssets(removed, remaining, repositories);
    await repositories.deleteCampaign(id);
    const nextCampaigns = campaigns.filter((campaign) => campaign.id !== id);
    const fallback = activeCampaignId !== id && nextCampaigns.some((campaign) => campaign.id === activeCampaignId)
      ? activeCampaignId
      : [...nextCampaigns].sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null;
    setCampaigns(nextCampaigns);
    setScenes((current) => current.filter((scene) => scene.campaignId !== id));
    setActiveCampaignId(fallback);
    await repositories.putSetting("last_campaign", fallback);
    if (removed.some((record) => record.key === displayedSceneKey)) {
      await repositories.putSetting("displayed_scene", null);
      setDisplayedSceneKey("");
    }
    return fallback;
  };

  const exportScene = async (key: string) => {
    await saveQueue.current;
    const record = await repositories.loadScene(key);
    if (!record) throw new Error("Scene no longer exists");
    const bytes = await prepareV1SceneExport(record, (id) => repositories.getAsset(id));
    downloadBlob(new Blob([Uint8Array.from(bytes)], { type: "application/octet-stream" }), sceneExportFilename(record.scene.name));
  };

  const exportCampaign = async (id: string) => {
    await saveQueue.current;
    const campaign = campaigns.find((candidate) => candidate.id === id);
    if (!campaign) throw new Error("Campaign no longer exists");
    const blob = await prepareV1CampaignExport(await repositories.listScenes(id), (assetId) => repositories.getAsset(assetId));
    downloadBlob(blob, campaignExportFilename(campaign));
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
  const createFogLayer = () => {
    if (!activeRecord.current) throw new Error("Create a persisted scene before adding a fog layer");
    if (status === "conflict") throw new Error("Resolve the scene conflict before adding a layer");
    const count = engine.getSnapshot().scene.layers.filter((layer) => layer.type === "fog").length;
    const id = crypto.randomUUID();
    const result = engine.dispatch({
      type: "layer.insert",
      layer: {
        id,
        name: `Fog ${count + 1}`,
        type: "fog",
        visible: true,
        assetIds: [],
      fogPolygons: [],
      fogClearPolygons: [],
      obstructionPolygons: [],
      lightSources: [],
      },
    });
    if (!result.ok) throw new Error(result.error);
    engine.dispatch({ type: "fog.layer.select", layerId: id });
  };
  const createEffectsLayer = () => {
    if (!activeRecord.current) throw new Error("Create a persisted scene before adding an effects layer");
    if (status === "conflict") throw new Error("Resolve the scene conflict before adding a layer");
    const count = engine.getSnapshot().scene.layers.filter((layer) => layer.type === "effects").length;
    const id = crypto.randomUUID();
    const result = engine.dispatch({
      type: "layer.insert",
      layer: { id, name: `Effects ${count + 1}`, type: "effects", visible: true, effects: [] },
    });
    if (!result.ok) throw new Error(result.error);
    return id;
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
      setDisplayedSceneKey(sceneRecords.some((record) => record.key === displayedScene) ? displayedScene! : "");
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
        ? { ...scene, name: saved.scene.name, version: saved.scene.version }
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
      displayedSceneKey,
      status,
      error,
      getAssetFile,
      selectCampaign,
      createCampaign,
      renameCampaign,
      deleteCampaign,
      createScene,
      renameScene,
      deleteScene,
      importScene,
      exportScene,
      exportCampaign,
      displayScene,
      selectScene,
      createAssetLayer,
      createFogLayer,
      createEffectsLayer,
      uploadImages,
    }}>
      {children}
    </EditorSceneContext>
  );
}

function validName(name: string, subject: "Campaign" | "Scene"): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(`${subject} name is required`);
  if (trimmed.length > 120) throw new Error(`${subject} name must be 120 characters or fewer`);
  return trimmed;
}

function assetIds(records: readonly V1SceneRecord[]): Set<string> {
  return new Set(records.flatMap((record) => record.scene.layers.flatMap((layer) => Object.keys(layer.assetLayer?.assets ?? {}))));
}

async function removeUnreferencedAssets(
  removed: readonly V1SceneRecord[],
  remaining: readonly V1SceneRecord[],
  repositories: V1Repositories
): Promise<void> {
  const retained = assetIds(remaining);
  await Promise.all([...assetIds(removed)].filter((id) => !retained.has(id)).map((id) => repositories.removeAsset(id)));
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
