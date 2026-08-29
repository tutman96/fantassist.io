import { decodeV1SceneExport, encodeV1SceneExport } from "./scene-codec";
import type { V1Asset, V1SceneRecord } from "./types";

export interface V1PreparedImportFile {
  readonly id: string;
  readonly file: File;
}

export interface V1PreparedSceneImport {
  readonly record: V1SceneRecord;
  readonly files: readonly V1PreparedImportFile[];
}

export async function prepareV1SceneExport(
  record: V1SceneRecord,
  getAsset: (id: string) => Promise<File | null>
): Promise<Uint8Array> {
  const assetIds: string[] = [];
  const seen = new Set<string>();
  for (const layer of record.scene.layers) {
    for (const assetId of Object.keys(layer.assetLayer?.assets ?? {})) {
      if (seen.has(assetId)) continue;
      seen.add(assetId);
      assetIds.push(assetId);
    }
  }
  const files = await Promise.all(assetIds.map(async (assetId) => {
    const file = await getAsset(assetId);
    if (!file) throw new Error(`Scene '${record.scene.name}' is missing referenced asset '${assetId}'`);
    return {
      id: assetId,
      payload: new Uint8Array(await file.arrayBuffer()),
      mediaType: file.type || "application/octet-stream",
    };
  }));
  return encodeV1SceneExport({ scene: record.scene, files });
}

type UuidFactory = () => string;

export function createBlankV1SceneRecord(
  campaignId: string,
  name: string,
  uuid: UuidFactory = () => crypto.randomUUID()
): V1SceneRecord {
  const key = `${campaignId}/${uuid()}`;
  return {
    key,
    campaignId,
    scene: {
      id: key,
      name,
      version: 0,
      table: { displayGrid: true, offset: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      layers: [
        { assetLayer: { id: uuid(), name: "Assets", visible: true, type: 0, assets: {} } },
        {
          fogLayer: {
            id: uuid(),
            name: "Fog",
            visible: true,
            type: 1,
            lightSources: [],
            obstructionPolygons: [],
            fogPolygons: [],
            fogClearPolygons: [],
          },
        },
      ],
    },
  };
}

export function prepareV1SceneImport(
  bytes: Uint8Array,
  campaignId: string,
  destinationScenes: readonly V1SceneRecord[],
  uuid: UuidFactory = () => crypto.randomUUID()
): V1PreparedSceneImport {
  const sceneExport = decodeV1SceneExport(bytes);
  const exportedFiles = new Map(sceneExport.files.map((file) => [file.id, file]));
  const assetIds: string[] = [];
  const seenAssetIds = new Set<string>();

  for (const layer of sceneExport.scene.layers) {
    for (const assetId of Object.keys(layer.assetLayer?.assets ?? {})) {
      if (!seenAssetIds.has(assetId)) {
        seenAssetIds.add(assetId);
        assetIds.push(assetId);
      }
    }
  }

  for (const assetId of assetIds) {
    if (!exportedFiles.has(assetId)) throw new Error(`Scene export is missing referenced asset '${assetId}'`);
  }

  const key = `${campaignId}/${uuid()}`;
  const assetIdMap = new Map(assetIds.map((id) => [id, `${campaignId}/${uuid()}`]));
  const layers = sceneExport.scene.layers.map((layer) => {
    if (!layer.assetLayer) return layer;
    const assets = Object.fromEntries(Object.entries(layer.assetLayer.assets).map(([oldId, asset]) => {
      const id = assetIdMap.get(oldId);
      if (!id) throw new Error(`Scene export contains an invalid asset reference '${oldId}'`);
      return [id, { ...asset, id } satisfies V1Asset];
    }));
    return { assetLayer: { ...layer.assetLayer, assets } };
  });
  const names = new Set(destinationScenes
    .filter((record) => record.campaignId === campaignId)
    .map((record) => record.scene.name));
  const name = uniqueName(sceneExport.scene.name, names);
  const files = assetIds.map((oldId) => {
    const exported = exportedFiles.get(oldId)!;
    const id = assetIdMap.get(oldId)!;
    return {
      id,
      file: new File([Uint8Array.from(exported.payload)], exportFileName(oldId, exported.mediaType), { type: exported.mediaType }),
    };
  });

  return {
    record: {
      key,
      campaignId,
      scene: { ...sceneExport.scene, id: key, name, layers },
    },
    files,
  };
}

function uniqueName(name: string, existing: ReadonlySet<string>): string {
  if (!existing.has(name)) return name;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${name} (${suffix})`;
    if (!existing.has(candidate)) return candidate;
  }
}

function exportFileName(id: string, mediaType: string): string {
  const base = id.split("/").at(-1) || "asset";
  if (/\.[a-z0-9]+$/i.test(base)) return base;
  const extension = mediaType.split("/", 2)[1]?.split(/[;+]/, 1)[0]?.replace("jpeg", "jpg");
  return extension ? `${base}.${extension}` : base;
}
