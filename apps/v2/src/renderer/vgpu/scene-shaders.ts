import type { ShaderSource } from "vgpu";
import type { ParticleEmitterShaders } from "../particles/particle-emitter";

export interface SceneShaders {
  readonly particleEmitter: ParticleEmitterShaders;
  readonly assets: string | ShaderSource;
  readonly fogMask: string | ShaderSource;
  readonly fogComposite: string | ShaderSource;
  readonly fogFeather: string | ShaderSource;
  readonly fogGuide: string | ShaderSource;
  readonly fogHandle: string | ShaderSource;
  readonly lightAccumulation: string | ShaderSource;
  readonly lightGuide: string | ShaderSource;
  readonly composite: string | ShaderSource;
  readonly present: string | ShaderSource;
  readonly radianceCascade: string | ShaderSource;
  readonly radianceResolve: string | ShaderSource;
  readonly rain: string | ShaderSource;
  readonly rainContext: string | ShaderSource;
  readonly embers: string | ShaderSource;
  readonly cloud: string | ShaderSource;
  readonly wallOfFire: string | ShaderSource;
  readonly wallOfFireContext: string | ShaderSource;
  readonly wallOfFireFlames: string | ShaderSource;
  readonly wallOfFireSparks: string | ShaderSource;
  readonly sceneCopy: string | ShaderSource;
}
