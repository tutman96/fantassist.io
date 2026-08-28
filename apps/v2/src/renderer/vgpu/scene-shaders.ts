import type { ShaderSource } from "vgpu";

export interface SceneShaders {
  readonly assets: string | ShaderSource;
  readonly fogMask: string | ShaderSource;
  readonly obstructionShadows: string | ShaderSource;
  readonly lightAccumulation: string | ShaderSource;
  readonly composite: string | ShaderSource;
  readonly present: string | ShaderSource;
}
