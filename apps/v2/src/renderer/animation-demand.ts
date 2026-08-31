import type { SceneDocument } from "@/engine/scene-document";

export function hasVisibleAnimatedEffects(scene: SceneDocument): boolean {
  return scene.layers.some((layer) =>
    layer.type === "effects" && layer.visible && layer.effects.some((sceneEffect) => sceneEffect.visible)
  );
}
