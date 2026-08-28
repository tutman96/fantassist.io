import localforage from "localforage";

import { decodeV1Scene, encodeV1Scene } from "./scene-codec";
import { SceneConflictError } from "./types";
import type { V1Campaign, V1Scene, V1SceneRecord } from "./types";

const CAMPAIGN_DATABASE = "campaign";
const SCENE_DATABASE = "scene_2";
const ASSET_DATABASE = "asset_file";
const SETTINGS_DATABASE = "settings";
const V2_METADATA_DATABASE = "fantassist_v2";

export interface V2SceneMetadata {
  readonly assetVisibility: Readonly<Record<string, boolean>>;
}

export interface V1Repositories {
  listCampaigns(): Promise<readonly V1Campaign[]>;
  putCampaign(campaign: V1Campaign): Promise<void>;
  listScenes(campaignId?: string): Promise<readonly V1SceneRecord[]>;
  loadScene(key: string): Promise<V1SceneRecord | null>;
  createScene(record: V1SceneRecord): Promise<void>;
  saveScene(record: V1SceneRecord, expectedVersion: number): Promise<V1SceneRecord>;
  getAsset(id: string): Promise<File | null>;
  putAsset(id: string, file: File): Promise<void>;
  removeAsset(id: string): Promise<void>;
  getSetting<T>(key: string): Promise<T | null>;
  putSetting<T>(key: string, value: T): Promise<void>;
  getSceneMetadata(sceneKey: string): Promise<V2SceneMetadata | null>;
  putSceneMetadata(sceneKey: string, metadata: V2SceneMetadata): Promise<void>;
  subscribeScene(key: string, listener: () => void): () => void;
}

export function createV1Repositories(): V1Repositories {
  const campaigns = localforage.createInstance({ name: CAMPAIGN_DATABASE });
  const scenes = localforage.createInstance({ name: SCENE_DATABASE });
  const assets = localforage.createInstance({ name: ASSET_DATABASE });
  const settings = localforage.createInstance({ name: SETTINGS_DATABASE });
  const metadata = localforage.createInstance({ name: V2_METADATA_DATABASE });
  const setter = crypto.randomUUID();

  return {
    async listCampaigns() {
      const values = await Promise.all((await campaigns.keys()).map((key) => campaigns.getItem<V1Campaign>(key)));
      return values.filter((value): value is V1Campaign => value !== null).sort((a, b) => a.name.localeCompare(b.name));
    },
    async putCampaign(campaign) {
      await campaigns.setItem(campaign.id, campaign);
      signalChange(CAMPAIGN_DATABASE, campaign.id, setter);
    },
    async listScenes(campaignId) {
      const prefix = campaignId ? `${campaignId}/` : "";
      const keys = (await scenes.keys()).filter((key) => key.startsWith(prefix));
      const records = await Promise.all(keys.map(async (key) => {
        const bytes = await scenes.getItem<Uint8Array>(key);
        return bytes ? sceneRecord(key, decodeV1Scene(bytes)) : null;
      }));
      return records.filter((record): record is V1SceneRecord => record !== null).sort((a, b) => a.scene.name.localeCompare(b.scene.name));
    },
    async loadScene(key) {
      const bytes = await scenes.getItem<Uint8Array>(key);
      return bytes ? sceneRecord(key, decodeV1Scene(bytes)) : null;
    },
    async createScene(record) {
      if (await scenes.getItem(record.key)) throw new Error(`Scene '${record.key}' already exists`);
      await scenes.setItem(record.key, encodeV1Scene(record.scene));
      signalChange(SCENE_DATABASE, record.key, setter);
    },
    async saveScene(record, expectedVersion) {
      const currentBytes = await scenes.getItem<Uint8Array>(record.key);
      if (!currentBytes) throw new Error(`Scene '${record.key}' no longer exists`);
      const current = decodeV1Scene(currentBytes);
      if (current.version !== expectedVersion) throw new SceneConflictError(expectedVersion, current.version);
      if (record.scene.version !== expectedVersion + 1) throw new Error("A persisted scene must advance exactly one version");
      await scenes.setItem(record.key, encodeV1Scene(record.scene));
      signalChange(SCENE_DATABASE, record.key, setter);
      return record;
    },
    getAsset(id) {
      return assets.getItem<File>(id);
    },
    async putAsset(id, file) {
      await assets.setItem(id, file);
      signalChange(ASSET_DATABASE, id, setter);
    },
    async removeAsset(id) {
      await assets.removeItem(id);
      signalChange(ASSET_DATABASE, id, setter);
    },
    getSetting<T>(key: string) {
      return settings.getItem<T>(key);
    },
    async putSetting<T>(key: string, value: T) {
      await settings.setItem(key, value);
      signalChange(SETTINGS_DATABASE, key, setter);
    },
    getSceneMetadata(sceneKey) {
      return metadata.getItem<V2SceneMetadata>(sceneKey);
    },
    async putSceneMetadata(sceneKey, value) {
      await metadata.setItem(sceneKey, value);
      signalChange(V2_METADATA_DATABASE, sceneKey, setter);
    },
    subscribeScene(key, listener) {
      const eventKey = `${SCENE_DATABASE}_storage_changed`;
      const handleStorage = (event: StorageEvent) => {
        if (event.key !== eventKey || !event.newValue) return;
        try {
          const message = JSON.parse(event.newValue) as { key?: string; setter?: string };
          if (message.key === key && message.setter !== setter) listener();
        } catch {
          // Ignore malformed v1 storage notifications.
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    },
  };
}

function sceneRecord(key: string, scene: V1Scene): V1SceneRecord {
  if (scene.id !== key) throw new Error(`Scene key '${key}' does not match embedded id '${scene.id}'`);
  const campaignId = key.split("/", 1)[0];
  if (!campaignId || !key.startsWith(`${campaignId}/`)) throw new Error(`Invalid scene key '${key}'`);
  return { key, campaignId, scene };
}

function signalChange(database: string, key: string, setter: string) {
  try {
    localStorage.setItem(`${database}_storage_changed`, JSON.stringify({ timestamp: Date.now(), key, setter }));
  } catch {
    // The IndexedDB write is already committed; cross-tab signaling is best effort.
  }
}
