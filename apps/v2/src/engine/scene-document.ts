import { DEFAULT_TABLE_CAMERA } from "./table-camera";
import type { TableCamera } from "./table-camera";

export interface AssetTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageAsset {
  readonly id: string;
  readonly layerId: string;
  readonly mediaId: string;
  readonly name: string;
  readonly type: "image";
  readonly visible: boolean;
  readonly intrinsicSize: { readonly width: number; readonly height: number };
  readonly transform: AssetTransform;
}

export interface FogPolygon {
  readonly vertices: readonly { readonly x: number; readonly y: number }[];
  readonly visibleOnTable: boolean;
}

interface SceneLayerBase {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
}

export interface AssetSceneLayer extends SceneLayerBase {
  readonly type: "assets";
  readonly assetIds: readonly string[];
}

export interface FogSceneLayer extends SceneLayerBase {
  readonly type: "fog";
  readonly assetIds: readonly string[];
  readonly fogPolygons: readonly FogPolygon[];
  readonly fogClearPolygons: readonly FogPolygon[];
}

export type SceneLayer = AssetSceneLayer | FogSceneLayer;

export interface SceneDocument {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly table: TableCamera;
  readonly layers: readonly SceneLayer[];
  readonly assets: readonly ImageAsset[];
}

type SceneDocumentInput = Omit<SceneDocument, "table"> & { readonly table?: TableCamera };

export const SAMPLE_ASSET_ID = "sample/astral-clearing";

export function createSampleSceneDocument(): SceneDocument {
  return freezeSceneDocument({
    id: "sample/scene",
    name: "Astral Clearing",
    version: 0,
    table: DEFAULT_TABLE_CAMERA,
    layers: [
      { id: "sample/assets", name: "Assets", type: "assets", visible: true, assetIds: [SAMPLE_ASSET_ID] },
      {
        id: "sample/fog",
        name: "Fog",
        type: "fog",
        visible: true,
        assetIds: [],
        fogPolygons: [{
          vertices: [{ x: 2, y: 3 }, { x: 18, y: 3 }, { x: 18, y: 19 }, { x: 2, y: 19 }],
          visibleOnTable: true,
        }],
        fogClearPolygons: [{
          vertices: [{ x: 8, y: 8 }, { x: 14, y: 8 }, { x: 14, y: 14 }, { x: 8, y: 14 }],
          visibleOnTable: true,
        }],
      },
    ],
    assets: [
      {
        id: SAMPLE_ASSET_ID,
        layerId: "sample/assets",
        mediaId: SAMPLE_ASSET_ID,
        name: "Astral clearing map",
        type: "image",
        visible: true,
        intrinsicSize: { width: 1600, height: 800 },
        transform: { x: 1.5, y: 2.5, rotation: 0, width: 36, height: 18 },
      },
    ],
  });
}

export function freezeSceneDocument(scene: SceneDocumentInput): SceneDocument {
  const table = scene.table ?? DEFAULT_TABLE_CAMERA;
  return Object.freeze({
    ...scene,
    table: Object.freeze({
      ...table,
      originGrid: Object.freeze({ ...table.originGrid }),
    }),
    layers: Object.freeze(scene.layers.map((layer) => layer.type === "assets"
      ? Object.freeze({ ...layer, assetIds: Object.freeze([...layer.assetIds]) })
      : Object.freeze({
          ...layer,
          assetIds: Object.freeze([]),
          fogPolygons: freezePolygons(layer.fogPolygons),
          fogClearPolygons: freezePolygons(layer.fogClearPolygons),
        }))),
    assets: Object.freeze(
      scene.assets.map((asset) =>
        Object.freeze({
          ...asset,
          transform: Object.freeze({ ...asset.transform }),
        })
      )
    ),
  });
}

function freezePolygons(polygons: readonly FogPolygon[]): readonly FogPolygon[] {
  return Object.freeze(polygons.map((polygon) => Object.freeze({
    ...polygon,
    vertices: Object.freeze(polygon.vertices.map((vertex) => Object.freeze({ ...vertex }))),
  })));
}
