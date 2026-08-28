import type { SceneEngineSnapshot } from "@/engine/scene-engine";

export type RenderProfile = "editor" | "output";

export interface SceneRenderer {
  readonly profile: RenderProfile;
  render(snapshot: SceneEngineSnapshot): void;
  dispose(): void;
}
