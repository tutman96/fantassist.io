import { freezeSceneDocument } from "@/engine/scene-document";
import type { SceneDocument } from "@/engine/scene-document";

import { decodeV1Scene, encodeV1Scene } from "./scene-codec";
import type { V1Scene } from "./types";

export function projectV1Scene(scene: V1Scene): SceneDocument | null {
  const layers = scene.layers.map((layer) => {
    if (layer.assetLayer) {
      return {
        id: layer.assetLayer.id,
        name: layer.assetLayer.name,
        type: "assets" as const,
        visible: layer.assetLayer.visible,
        assetIds: Object.values(layer.assetLayer.assets)
          .filter((asset) => asset.type === 0 && asset.transform !== undefined)
          .map((asset) => asset.id),
      };
    }
    return {
      id: layer.fogLayer?.id ?? "",
      name: layer.fogLayer?.name ?? "Fog",
      type: "fog" as const,
      visible: layer.fogLayer?.visible ?? false,
      assetIds: [],
    };
  });
  const assets = scene.layers.flatMap((layer) => {
    const assetLayer = layer.assetLayer;
    if (!assetLayer) return [];
    return Object.values(assetLayer.assets).flatMap((asset, index) => {
      if (asset.type !== 0 || !asset.transform) return [];
      return [{
        id: asset.id,
        layerId: assetLayer.id,
        mediaId: asset.id,
        name: `${assetLayer.name || "Assets"} image ${index + 1}`,
        type: "image" as const,
        visible: assetLayer.visible,
        intrinsicSize: asset.size ?? { width: asset.transform.width, height: asset.transform.height },
        transform: { ...asset.transform },
      }];
    });
  });
  if (assets.length === 0) return null;
  return freezeSceneDocument({
    id: scene.id,
    name: scene.name,
    version: scene.version,
    layers,
    assets,
  });
}

export function patchV1SceneTransforms(
  source: V1Scene,
  document: SceneDocument,
  version: number
): V1Scene {
  const clone = decodeV1Scene(encodeV1Scene(source));
  const images = new Map(document.assets.map((asset) => [asset.id, asset]));
  return {
    ...clone,
    version,
    layers: clone.layers.map((layer) => {
      if (!layer.assetLayer) return layer;
      return {
        ...layer,
        assetLayer: {
          ...layer.assetLayer,
          assets: synchronizeAssets(layer.assetLayer.id, layer.assetLayer.assets, images),
        },
      };
    }),
  };
}

function synchronizeAssets(
  layerId: string,
  sourceAssets: Readonly<Record<string, import("./types").V1Asset>>,
  images: ReadonlyMap<string, SceneDocument["assets"][number]>
) {
  const entries = Object.entries(sourceAssets).flatMap(([key, asset]) => {
    if (asset.type !== 0) return [[key, asset] as const];
    const image = images.get(asset.id);
    return image ? [[key, { ...asset, size: image.intrinsicSize, transform: { ...image.transform } }] as const] : [];
  });
  const existingIds = new Set(Object.values(sourceAssets).map((asset) => asset.id));
  for (const image of images.values()) {
    if (image.layerId !== layerId || existingIds.has(image.id)) continue;
    entries.push([image.id, {
      id: image.id,
      type: 0,
      size: { ...image.intrinsicSize },
      transform: { ...image.transform },
    }]);
  }
  return Object.fromEntries(entries);
}
