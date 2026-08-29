import { resolve } from "node:path";

import { resolveShader } from "@vgpu/wgsl/runtime";

import type { SceneShaders } from "../src/renderer/vgpu/scene-shaders";

export async function loadSceneShaders(): Promise<SceneShaders> {
  const shaderDirectory = resolve("src/renderer/vgpu/shaders");
  const load = async (name: string) =>
    (await resolveShader({ entry: resolve(shaderDirectory, name), validate: "off" })).wgsl;
  const [assets, fogMask, fogComposite, fogFeather, fogGuide, fogHandle, lightAccumulation, lightCoverage, lightGuide, composite, present, radianceCascade, radianceJfaInit, radianceJfaPass, radianceResolve, radianceSdfFinalize, radianceSeed, sceneCopy] =
    await Promise.all([
      load("assets.wgsl"),
      load("fog-mask.wgsl"),
      load("fog-composite.wgsl"),
      load("fog-feather.wgsl"),
      load("fog-guide.wgsl"),
      load("fog-handle.wgsl"),
      load("light-accumulation.wgsl"),
      load("light-coverage.wgsl"),
      load("light-guide.wgsl"),
      load("composite.wgsl"),
      load("present.wgsl"),
      load("radiance-cascade.wgsl"),
      load("radiance-jfa-init.wgsl"),
      load("radiance-jfa-pass.wgsl"),
      load("radiance-resolve.wgsl"),
      load("radiance-sdf-finalize.wgsl"),
      load("radiance-seed.wgsl"),
      load("scene-copy.wgsl"),
    ]);
  return { assets, fogMask, fogComposite, fogFeather, fogGuide, fogHandle, lightAccumulation, lightCoverage, lightGuide, composite, present, radianceCascade, radianceJfaInit, radianceJfaPass, radianceResolve, radianceSdfFinalize, radianceSeed, sceneCopy };
}
