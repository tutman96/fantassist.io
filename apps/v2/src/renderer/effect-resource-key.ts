import type { SceneEngineSnapshot } from "../engine/scene-engine";

export function effectGeometryKey(snapshot: SceneEngineSnapshot): string {
  return [snapshot.scene.id, ...snapshot.scene.layers.flatMap((layer) => layer.type === "effects"
    ? [layer.id, layer.visible ? "1" : "0", ...layer.effects.flatMap((sceneEffect) => [sceneEffect.id, sceneEffect.kind, sceneEffect.visible ? "1" : "0", sceneEffect.seed, ...effectEmitterKey(sceneEffect), ...sceneEffect.vertices.flatMap((vertex) => [vertex.x, vertex.y])])]
    : [])].join(":");
}

function effectEmitterKey(effect: import("../engine/scene-document").SceneEffect): readonly number[] {
  if (effect.kind === "rain" || effect.kind === "embers") return [effect.density, effect.speed];
  return [];
}
