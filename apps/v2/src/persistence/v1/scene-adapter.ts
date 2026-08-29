import { freezeSceneDocument } from "@/engine/scene-document";
import type { SceneDocument } from "@/engine/scene-document";
import { normalizeTableCamera } from "@/engine/table-camera";

import { decodeV1Scene, encodeV1Scene } from "./scene-codec";
import type { V1Scene } from "./types";

export function projectV1Scene(scene: V1Scene): SceneDocument {
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
    const fogLayer = layer.fogLayer;
    return {
      id: fogLayer?.id ?? "",
      name: fogLayer?.name ?? "Fog",
      type: "fog" as const,
      visible: fogLayer?.visible ?? false,
      assetIds: [] as const,
      fogPolygons: projectPolygons(fogLayer?.fogPolygons ?? []),
      fogClearPolygons: projectPolygons(fogLayer?.fogClearPolygons ?? []),
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
        visible: true,
        intrinsicSize: asset.size ?? { width: asset.transform.width, height: asset.transform.height },
        ...(asset.calibration ? { calibration: { ...asset.calibration } } : {}),
        transform: { ...asset.transform },
      }];
    });
  });
  return freezeSceneDocument({
    id: scene.id,
    name: scene.name,
    version: scene.version,
    table: normalizeTableCamera({
      originGrid: scene.table?.offset,
      scale: scene.table?.scale,
      displayGrid: scene.table?.displayGrid,
    }),
    layers,
    assets,
  });
}

export async function hydrateAssetDisplayNames(
  document: SceneDocument,
  getFile: (assetId: string) => Promise<File | null>
): Promise<SceneDocument> {
  const assets = await Promise.all(document.assets.map(async (asset) => {
    const file = await getFile(asset.mediaId);
    if (!file?.name) return asset;
    return { ...asset, name: file.name.replace(/\.[^.]+$/, "") || asset.name };
  }));
  return freezeSceneDocument({ ...document, assets });
}

export function applyAssetVisibilityMetadata(
  document: SceneDocument,
  visibility: Readonly<Record<string, boolean>> | undefined
): SceneDocument {
  if (!visibility) return document;
  return freezeSceneDocument({
    ...document,
    assets: document.assets.map((asset) => ({
      ...asset,
      visible: visibility[asset.id] ?? true,
    })),
  });
}

export function patchV1SceneTransforms(
  source: V1Scene,
  document: SceneDocument,
  version: number
): V1Scene {
  const clone = decodeV1Scene(encodeV1Scene(source));
  const images = new Map(document.assets.map((asset) => [asset.id, asset]));
  const sourceLayers = new Map(clone.layers.map((layer) => [
    layer.assetLayer?.id ?? layer.fogLayer?.id ?? "",
    layer,
  ]));
  return {
    ...clone,
    version,
    table: {
      displayGrid: document.table.displayGrid,
      offset: { ...document.table.originGrid },
      rotation: clone.table?.rotation ?? 0,
      scale: document.table.scale,
    },
    layers: document.layers.map((domainLayer) => {
      const layer = sourceLayers.get(domainLayer.id);
      if (layer?.assetLayer) {
        return {
          assetLayer: {
            ...layer.assetLayer,
            name: domainLayer.name,
            visible: domainLayer.visible,
            assets: synchronizeAssets(layer.assetLayer.id, layer.assetLayer.assets, images),
          },
        };
      }
      if (layer?.fogLayer) {
        if (domainLayer.type !== "fog") throw new Error(`Layer '${domainLayer.id}' changed type`);
        return {
          fogLayer: {
            ...layer.fogLayer,
            name: domainLayer.name,
            visible: domainLayer.visible,
            fogPolygons: persistPolygons(domainLayer.fogPolygons, 0),
            fogClearPolygons: persistPolygons(domainLayer.fogClearPolygons, 1),
          },
        };
      }
      if (domainLayer.type === "assets") {
        return {
          assetLayer: {
            id: domainLayer.id,
            name: domainLayer.name,
            visible: domainLayer.visible,
            type: 0,
            assets: synchronizeAssets(domainLayer.id, {}, images),
          },
        };
      }
      return {
        fogLayer: {
          id: domainLayer.id,
          name: domainLayer.name,
          visible: domainLayer.visible,
          type: 1,
          lightSources: [],
          obstructionPolygons: [],
          fogPolygons: persistPolygons(domainLayer.fogPolygons, 0),
          fogClearPolygons: persistPolygons(domainLayer.fogClearPolygons, 1),
        },
      };
    }),
  };
}

function projectPolygons(polygons: readonly import("./types").V1Polygon[]) {
  return polygons.map((polygon) => ({
    vertices: polygon.verticies.map((vertex) => ({ ...vertex })),
    visibleOnTable: polygon.visibleOnTable,
  }));
}

function persistPolygons(
  polygons: readonly import("@/engine/scene-document").FogPolygon[],
  type: 0 | 1
) {
  return polygons.map((polygon) => ({
    type,
    verticies: polygon.vertices.map((vertex) => ({ ...vertex })),
    visibleOnTable: polygon.visibleOnTable,
  }));
}

function synchronizeAssets(
  layerId: string,
  sourceAssets: Readonly<Record<string, import("./types").V1Asset>>,
  images: ReadonlyMap<string, SceneDocument["assets"][number]>
) {
  const entries = Object.entries(sourceAssets).flatMap(([key, asset]) => {
    if (asset.type !== 0) return [[key, asset] as const];
    const image = images.get(asset.id);
    return image ? [[key, {
      ...asset,
      size: image.intrinsicSize,
      transform: { ...image.transform },
      calibration: image.calibration ? { ...image.calibration } : undefined,
    }] as const] : [];
  });
  const existingIds = new Set(Object.values(sourceAssets).map((asset) => asset.id));
  for (const image of images.values()) {
    if (image.layerId !== layerId || existingIds.has(image.id)) continue;
    entries.push([image.id, {
      id: image.id,
      type: 0,
      size: { ...image.intrinsicSize },
      transform: { ...image.transform },
      ...(image.calibration ? { calibration: { ...image.calibration } } : {}),
    }]);
  }
  return Object.fromEntries(entries);
}
