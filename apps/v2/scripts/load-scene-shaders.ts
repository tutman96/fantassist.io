import { resolve } from "node:path";

import { resolveShader } from "@vgpu/wgsl/runtime";

import type { SceneShaders } from "../src/renderer/vgpu/scene-shaders";

export async function loadSceneShaders(): Promise<SceneShaders> {
  const shaderDirectory = resolve("src/renderer/vgpu/shaders");
  const particleShaderDirectory = resolve("src/renderer/particles/wgsl");
  const load = async (directory: string, name: string) =>
    (await resolveShader({ entry: resolve(directory, name), validate: "off" })).wgsl;
  const loadScene = (name: string) => load(shaderDirectory, name);
  const loadParticle = (name: string) => load(particleShaderDirectory, name);
  const [assets, fogMask, fogComposite, fogFeather, fogGuide, fogHandle, lightAccumulation, lightGuide, composite, present, radianceCascade, radianceResolve, rain, rainContext, embers, cloud, wallOfFire, wallOfFireContext, wallOfFireFlames, wallOfFireSparks, sceneCopy, particleStateUpdate, particleSpawn, particleSteadyStateUpdate, particleSteadyStateFill, particleRetimeLifetime] =
    await Promise.all([
      loadScene("assets.wgsl"),
      loadScene("fog-mask.wgsl"),
      loadScene("fog-composite.wgsl"),
      loadScene("fog-feather.wgsl"),
      loadScene("fog-guide.wgsl"),
      loadScene("fog-handle.wgsl"),
      loadScene("light-accumulation.wgsl"),
      loadScene("light-guide.wgsl"),
      loadScene("composite.wgsl"),
      loadScene("present.wgsl"),
      loadScene("radiance-cascade.wgsl"),
      loadScene("radiance-resolve.wgsl"),
      loadScene("rain.wgsl"),
      loadScene("rain-context.wgsl"),
      loadScene("embers.wgsl"),
      loadScene("cloud.wgsl"),
      loadScene("wall-of-fire.wgsl"),
      loadScene("wall-of-fire-context.wgsl"),
      loadScene("wall-of-fire-flames.wgsl"),
      loadScene("wall-of-fire-sparks.wgsl"),
      loadScene("scene-copy.wgsl"),
      loadParticle("state-update.wgsl"),
      loadParticle("spawn.wgsl"),
      loadParticle("steady-state-update.wgsl"),
      loadParticle("steady-state-fill.wgsl"),
      loadParticle("retime-lifetime.wgsl"),
    ]);
  return {
    particleEmitter: {
      stateUpdate: particleStateUpdate,
      spawn: particleSpawn,
      steadyStateUpdate: particleSteadyStateUpdate,
      steadyStateFill: particleSteadyStateFill,
      retimeLifetime: particleRetimeLifetime,
    },
    assets, fogMask, fogComposite, fogFeather, fogGuide, fogHandle, lightAccumulation, lightGuide,
    composite, present, radianceCascade, radianceResolve, rain, rainContext, embers, cloud, wallOfFire, wallOfFireContext, wallOfFireFlames, wallOfFireSparks, sceneCopy,
  };
}
