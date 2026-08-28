import type { RenderProfile } from "./scene-renderer";

export const SCENE_PASS_ORDER = Object.freeze([
  "asset-background",
  "fog-mask",
  "obstruction-shadows",
  "light-accumulation",
  "composite",
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
