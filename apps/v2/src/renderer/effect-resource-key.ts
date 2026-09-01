import type { SceneEngineSnapshot } from "../engine/scene-engine";

export function effectGeometryKey(snapshot: SceneEngineSnapshot): string {
  return [snapshot.scene.id, ...snapshot.scene.layers.flatMap((layer) => layer.type === "effects"
    ? [layer.id, layer.visible ? "1" : "0", ...layer.effects.flatMap((sceneEffect) => [sceneEffect.id, sceneEffect.kind, sceneEffect.visible ? "1" : "0", sceneEffect.seed, sceneEffect.density, sceneEffect.speed, ...sceneEffect.vertices.flatMap((vertex) => [vertex.x, vertex.y])])]
    : [])].join(":");
}
