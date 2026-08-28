import type { EngineSnapshot } from "@/engine/scene-engine";

export type RenderProfile = "editor" | "output";

export interface SceneRenderer<TScene> {
  readonly profile: RenderProfile;
  render(snapshot: EngineSnapshot<TScene>): void;
  dispose(): void;
}
