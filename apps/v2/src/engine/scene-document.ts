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

export interface SceneLayer {
  readonly id: string;
  readonly name: string;
  readonly type: "assets" | "fog";
  readonly visible: boolean;
  readonly assetIds: readonly string[];
}

export interface SceneDocument {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly layers: readonly SceneLayer[];
  readonly assets: readonly ImageAsset[];
}

export const SAMPLE_ASSET_ID = "sample/astral-clearing";

export function createSampleSceneDocument(): SceneDocument {
  return freezeSceneDocument({
    id: "sample/scene",
    name: "Astral Clearing",
    version: 0,
    layers: [
      { id: "sample/assets", name: "Assets", type: "assets", visible: true, assetIds: [SAMPLE_ASSET_ID] },
      { id: "sample/fog", name: "Fog", type: "fog", visible: true, assetIds: [] },
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

export function freezeSceneDocument(scene: SceneDocument): SceneDocument {
  return Object.freeze({
    ...scene,
    layers: Object.freeze(scene.layers.map((layer) => Object.freeze({ ...layer, assetIds: Object.freeze([...layer.assetIds]) }))),
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
