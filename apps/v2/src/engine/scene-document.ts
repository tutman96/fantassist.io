import { DEFAULT_TABLE_CAMERA } from "./table-camera";
import type { TableCamera } from "./table-camera";

export interface AssetTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly width: number;
  readonly height: number;
}

export interface AssetCalibration {
  readonly xOffset: number;
  readonly yOffset: number;
  readonly ppiX: number;
  readonly ppiY: number;
}

export interface ImageAsset {
  readonly id: string;
  readonly layerId: string;
  readonly mediaId: string;
  readonly name: string;
  readonly type: "image";
  readonly visible: boolean;
  readonly intrinsicSize: { readonly width: number; readonly height: number };
  readonly calibration?: AssetCalibration;
  readonly transform: AssetTransform;
}

export interface FogPolygon {
  readonly vertices: readonly { readonly x: number; readonly y: number }[];
  readonly visibleOnTable: boolean;
}

export interface SceneLight {
  readonly position: { readonly x: number; readonly y: number };
  readonly brightLightDistance: number;
  readonly dimLightDistance: number;
  readonly color: { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
}

interface SceneEffectBase {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly vertices: readonly { readonly x: number; readonly y: number }[];
  readonly seed: number;
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly opacity: number;
}

export interface RainEffect extends SceneEffectBase {
  readonly kind: "rain";
  readonly density: number;
  readonly speed: number;
  readonly dropSize: number;
}

export interface EmbersEffect extends SceneEffectBase {
  readonly kind: "embers";
  readonly density: number;
  readonly speed: number;
  readonly particleSize: number;
}

export interface CloudEffect extends SceneEffectBase {
  readonly kind: "cloud";
  readonly coverage: number;
  readonly speed: number;
  readonly scale: number;
  readonly turbulence: number;
}

export interface WallOfFireEffect extends SceneEffectBase {
  readonly kind: "wall-of-fire";
  readonly width: number;
  readonly intensity: number;
  readonly speed: number;
  readonly turbulence: number;
  readonly sparkDensity: number;
  readonly sparkSize: number;
}

export type SceneEffect = RainEffect | EmbersEffect | CloudEffect | WallOfFireEffect;

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
  readonly obstructionPolygons: readonly FogPolygon[];
  readonly lightSources: readonly SceneLight[];
}

export interface EffectsSceneLayer extends SceneLayerBase {
  readonly type: "effects";
  readonly effects: readonly SceneEffect[];
}

export type SceneLayer = AssetSceneLayer | FogSceneLayer | EffectsSceneLayer;

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
        obstructionPolygons: [],
        lightSources: [],
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
    layers: Object.freeze(scene.layers.map((layer) => {
      if (layer.type === "assets") {
        return Object.freeze({ ...layer, assetIds: Object.freeze([...layer.assetIds]) });
      }
      if (layer.type === "fog") {
        return Object.freeze({
          ...layer,
          assetIds: Object.freeze([]),
          fogPolygons: freezePolygons(layer.fogPolygons),
          fogClearPolygons: freezePolygons(layer.fogClearPolygons),
          obstructionPolygons: freezePolygons(layer.obstructionPolygons),
          lightSources: Object.freeze(layer.lightSources.map((light) => Object.freeze({
            ...light,
            position: Object.freeze({ ...light.position }),
            color: Object.freeze({ ...light.color }),
          }))),
        });
      }
      return Object.freeze({
        ...layer,
        effects: Object.freeze(layer.effects.map((effect) => Object.freeze({
          ...effect,
          vertices: Object.freeze(effect.vertices.map((vertex) => Object.freeze({ ...vertex }))),
          color: Object.freeze({ ...effect.color }),
        }))),
      });
    })),
    assets: Object.freeze(
      scene.assets.map((asset) =>
        Object.freeze({
          ...asset,
          ...(asset.calibration ? { calibration: Object.freeze({ ...asset.calibration }) } : {}),
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
