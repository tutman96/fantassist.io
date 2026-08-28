import type { RenderProfile } from "./scene-renderer";
import type { SceneDocument } from "@/engine/scene-document";

export const SCENE_PASS_ORDER = Object.freeze([
  "scene-layers",
  "editor-overlay",
  "present",
] as const);

export type ScenePass = (typeof SCENE_PASS_ORDER)[number];

export interface RenderPlan {
  readonly profile: RenderProfile;
  readonly passes: readonly ScenePass[];
  readonly showEditorGrid: boolean;
  readonly showGrid: boolean;
  readonly fogOpacity: number;
}

export type SceneLayerOperation =
  | { readonly type: "assets"; readonly layerId: string; readonly assetIds: readonly string[] }
  | { readonly type: "fog"; readonly layerId: string };

export function compileSceneLayerOperations(scene: SceneDocument): readonly SceneLayerOperation[] {
  const operations: SceneLayerOperation[] = [];
  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    operations.push(layer.type === "assets"
      ? { type: "assets", layerId: layer.id, assetIds: layer.assetIds }
      : { type: "fog", layerId: layer.id });
  }
  return Object.freeze(operations);
}

export function createRenderPlan(
  profile: RenderProfile,
  options: { readonly showGrid?: boolean } = {}
): RenderPlan {
  return Object.freeze({
    profile,
    passes: SCENE_PASS_ORDER,
    showEditorGrid: profile === "editor",
    showGrid: options.showGrid ?? profile === "editor",
    fogOpacity: profile === "editor" ? 0.58 : 1,
  });
}
