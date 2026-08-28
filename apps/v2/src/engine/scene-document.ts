export interface AssetTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageAsset {
  readonly id: string;
  readonly name: string;
  readonly type: "image";
  readonly transform: AssetTransform;
}

export interface SceneDocument {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly assets: readonly ImageAsset[];
}

export const SAMPLE_ASSET_ID = "sample/astral-clearing";

export function createSampleSceneDocument(): SceneDocument {
  return freezeSceneDocument({
    id: "sample/scene",
    name: "Astral Clearing",
    version: 0,
    assets: [
      {
        id: SAMPLE_ASSET_ID,
        name: "Astral clearing map",
        type: "image",
        transform: { x: 1.5, y: 2.5, rotation: 0, width: 36, height: 18 },
      },
    ],
  });
}

export function freezeSceneDocument(scene: SceneDocument): SceneDocument {
  return Object.freeze({
    ...scene,
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
