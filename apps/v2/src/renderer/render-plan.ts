import type { RenderProfile } from "./scene-renderer";
import type { SceneDocument } from "@/engine/scene-document";

export const SCENE_PASS_ORDER = Object.freeze([
  "scene-layers",
  "editor-overlay",
  "present",
] as const);
export const FOG_EDGE_SPREAD_GRID = 1 / 16;

export type ScenePass = (typeof SCENE_PASS_ORDER)[number];

export interface RenderPlan {
  readonly profile: RenderProfile;
  readonly passes: readonly ScenePass[];
  readonly showEditorGrid: boolean;
  readonly showGrid: boolean;
  readonly fogOpacity: number;
  readonly particleDensityScale: number;
}

export type SceneLayerOperation =
  | { readonly type: "assets"; readonly layerId: string; readonly assetIds: readonly string[] }
  | { readonly type: "fog"; readonly layerId: string }
  | { readonly type: "effects"; readonly layerId: string; readonly effectIds: readonly string[] };

export function compileSceneLayerOperations(scene: SceneDocument): readonly SceneLayerOperation[] {
  const operations: SceneLayerOperation[] = [];
  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    if (layer.type === "assets") {
      operations.push({ type: "assets", layerId: layer.id, assetIds: layer.assetIds });
    } else if (layer.type === "fog") {
      operations.push({ type: "fog", layerId: layer.id });
    } else {
      operations.push({ type: "effects", layerId: layer.id, effectIds: layer.effects.map((effect) => effect.id) });
    }
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
    particleDensityScale: profile === "editor" ? 0.5 : 1,
  });
}
