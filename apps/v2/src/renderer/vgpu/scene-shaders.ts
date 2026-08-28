import type { ShaderSource } from "vgpu";

export interface SceneShaders {
  readonly assets: string | ShaderSource;
  readonly fogMask: string | ShaderSource;
  readonly fogComposite: string | ShaderSource;
  readonly fogGuide: string | ShaderSource;
  readonly composite: string | ShaderSource;
  readonly present: string | ShaderSource;
}
