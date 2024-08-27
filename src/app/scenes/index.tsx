import { v4 } from "uuid";
import { useCallback, useEffect, useState } from "react";
import { TarWriter } from "@gera2ld/tarjs";

import globalStorage from "@/storage";
import { createNewLayer, unflattenLayer } from "./layer";
import { deleteAsset, fileStorage } from "./asset";
import * as Types from "@/protos/scene";

const storage = globalStorage<Types.Scene, Uint8Array>(
  "scene_2",
  (s) => Types.Scene.encode(s).finish(),
  Types.Scene.decode
);
export const sceneDatabase = {
  ...storage,
  deleteItem: async (key: string) => {
    const sceneRaw = await storage.storage.getItem(key);
    if (!sceneRaw) return;
    const scene = Types.Scene.decode(sceneRaw);
    for (const layer of scene.layers) {
      if (!layer.assetLayer) continue;

      for (const asset of Object.values(
        (layer.assetLayer as Types.AssetLayer).assets
      )) {
        await deleteAsset(asset);
      }
    }

    await storage.deleteItem(key);
  },
};
export default sceneDatabase;

export function createNewScene(campaignId: string): Types.Scene {
  const defaultLayer = createNewLayer(Types.Layer_LayerType.ASSETS);
  defaultLayer.name = "Layer 1";
  return {
    id: `${campaignId}/${v4()}`,
    name: "Untitled",
    version: 0,
    table: {
      offset: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
      displayGrid: true,
    },
    layers: [unflattenLayer(defaultLayer)],
  };
}

async function sceneToSceneExport(scene: Types.Scene): Promise<Uint8Array> {
  const assetIds = new Set<string>();
  for (const layer of scene.layers) {
    if (!layer.assetLayer) continue;
    for (const assetId of Object.keys(layer.assetLayer.assets)) {
      assetIds.add(assetId);
    }
  }

  const files = new Array<Types.SceneExport_File>();

  for (const assetId of Array.from(assetIds.keys())) {
    const asset = await fileStorage.getItem(assetId);
    if (!asset) {
      throw new Error(`Missing asset ${assetId}`);
    }
    files.push({
      id: assetId,
      payload: new Uint8Array(await asset.arrayBuffer()),
      mediaType: asset.type,
    });
  }

  return Types.SceneExport.encode({ scene, files }).finish();
}

export async function exportScene(scene: Types.Scene) {
  const exp = await sceneToSceneExport(scene);

  const blob = new Blob([exp], { type: "application/octet-stream" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = scene.name + ".scene";
  link.href = objectUrl;
  link.click();
}

// Export all scenes as individual .scene files in a single tarball
export async function exportAllScenes() {
  const tar = new TarWriter();
  const sceneIds = await storage.storage.keys();
  for (const sceneId of sceneIds) {
    const sceneRaw = await storage.storage.getItem(sceneId);
    if (!sceneRaw) continue;
    const scene = Types.Scene.decode(sceneRaw);
    const exp = await sceneToSceneExport(scene);
    tar.addFile(scene.name + ".scene", exp);
  }

  const blob = await tar.write();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = "scenes.tar";
  link.href = objectUrl;
  link.click();
}

export async function importScene(campaignId: string) {
  const fileDialogInput = document.createElement("input");
  fileDialogInput.type = "file";
  fileDialogInput.accept = ".scene";

  fileDialogInput.click();
  const file = await new Promise<File>((res, rej) => {
    fileDialogInput.onchange = (e) => {
      const files = (e!.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        return rej(new Error("Cancelled"));
      }
      res(files.item(0)!);
    };
  });

  const exportBinary = await new Promise<ArrayBuffer>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      if (fr.result) {
        res(fr.result as ArrayBuffer);
      }
    };
    fr.onerror = (e) => {
      rej(e);
    };
    fr.readAsArrayBuffer(file);
  });

  const exp = Types.SceneExport.decode(new Uint8Array(exportBinary));
  const scene = exp.scene!;
  scene.id = `${campaignId}/${v4()}`;

  const existingScenes = (
    await Promise.all(
      (await storage.storage.keys()).map((k) => storage.storage.getItem(k))
    )
  ).map((b) => Types.Scene.decode(b!));

  let nameCollisions = 1;
  const originalName = scene.name;
  for (const existingScene of existingScenes) {
    if (existingScene.name === scene.name) {
      scene.name = originalName + ` (${++nameCollisions})`;
    }
  }

  const assetMap = new Map<string, string>();
  for (const layer of scene.layers) {
    if (!layer.assetLayer) continue;
    for (const assetId of Object.keys(layer.assetLayer.assets)) {
      const newAssetId = `${campaignId}/${v4()}`;
      assetMap.set(assetId, newAssetId);

      layer.assetLayer.assets[assetId].id = newAssetId;
      layer.assetLayer.assets[newAssetId] = layer.assetLayer.assets[assetId];
      delete layer.assetLayer.assets[assetId];
    }
  }

  for (const file of exp.files) {
    const newAssetId = assetMap.get(file.id)!;
    await fileStorage.setItem(
      newAssetId,
      new File([file.payload], newAssetId, { type: file.mediaType })
    );
  }

  await storage.storage.setItem(scene.id, Types.Scene.encode(scene).finish());
  return scene;
}
