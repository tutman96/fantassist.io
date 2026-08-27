import { Scene, SceneExport } from "../../protos/scene";

function isSupportedLayer(layer: Scene["layers"][number]) {
  return layer.assetLayer !== undefined || layer.fogLayer !== undefined;
}

export function normalizeScene(scene: Scene): Scene {
  const layers = scene.layers.filter(isSupportedLayer);
  return layers.length === scene.layers.length ? scene : { ...scene, layers };
}

export function encodeScene(scene: Scene): Uint8Array {
  return Scene.encode(normalizeScene(scene)).finish();
}

export function decodeScene(bytes: Uint8Array): Scene {
  return normalizeScene(Scene.decode(bytes));
}

export function encodeSceneExport(sceneExport: SceneExport): Uint8Array {
  return SceneExport.encode({
    ...sceneExport,
    scene: sceneExport.scene ? normalizeScene(sceneExport.scene) : undefined,
  }).finish();
}

export function decodeSceneExport(bytes: Uint8Array): SceneExport {
  const sceneExport = SceneExport.decode(bytes);
  return {
    ...sceneExport,
    scene: sceneExport.scene ? normalizeScene(sceneExport.scene) : undefined,
  };
}
