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
  const transforms = new Map(document.assets.map((asset) => [asset.id, asset.transform]));
  return {
    ...clone,
    version,
    layers: clone.layers.map((layer) => {
      if (!layer.assetLayer) return layer;
      return {
        ...layer,
        assetLayer: {
          ...layer.assetLayer,
          assets: Object.fromEntries(
            Object.entries(layer.assetLayer.assets).map(([key, asset]) => {
              const transform = transforms.get(asset.id);
              return [key, transform ? { ...asset, transform: { ...transform } } : asset];
            })
          ),
        },
      };
    }),
  };
}
