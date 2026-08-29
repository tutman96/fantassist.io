import type { ShaderSource } from "vgpu";

export interface SceneShaders {
  readonly assets: string | ShaderSource;
  readonly fogMask: string | ShaderSource;
  readonly fogComposite: string | ShaderSource;
  readonly fogFeather: string | ShaderSource;
  readonly fogGuide: string | ShaderSource;
  readonly fogHandle: string | ShaderSource;
  readonly lightAccumulation: string | ShaderSource;
  readonly lightCoverage: string | ShaderSource;
  readonly lightGuide: string | ShaderSource;
  readonly composite: string | ShaderSource;
  readonly present: string | ShaderSource;
  readonly radianceCascade: string | ShaderSource;
  readonly radianceJfaInit: string | ShaderSource;
  readonly radianceJfaPass: string | ShaderSource;
  readonly radianceResolve: string | ShaderSource;
  readonly radianceSdfFinalize: string | ShaderSource;
  readonly radianceSeed: string | ShaderSource;
  readonly sceneCopy: string | ShaderSource;
}
