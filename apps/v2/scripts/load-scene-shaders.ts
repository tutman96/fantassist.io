import { resolve } from "node:path";

import { resolveShader } from "@vgpu/wgsl/runtime";

import type { SceneShaders } from "../src/renderer/vgpu/scene-shaders";

export async function loadSceneShaders(): Promise<SceneShaders> {
  const shaderDirectory = resolve("src/renderer/vgpu/shaders");
  const load = async (name: string) =>
    (await resolveShader({ entry: resolve(shaderDirectory, name), validate: "off" })).wgsl;
  const [assets, fogMask, fogComposite, fogFeather, fogGuide, fogHandle, lightAccumulation, lightGuide, composite, present, radianceCascade, radianceResolve, sceneCopy] =
    await Promise.all([
      load("assets.wgsl"),
      load("fog-mask.wgsl"),
      load("fog-composite.wgsl"),
      load("fog-feather.wgsl"),
      load("fog-guide.wgsl"),
      load("fog-handle.wgsl"),
      load("light-accumulation.wgsl"),
      load("light-guide.wgsl"),
      load("composite.wgsl"),
      load("present.wgsl"),
      load("radiance-cascade.wgsl"),
      load("radiance-resolve.wgsl"),
      load("scene-copy.wgsl"),
    ]);
  return { assets, fogMask, fogComposite, fogFeather, fogGuide, fogHandle, lightAccumulation, lightGuide, composite, present, radianceCascade, radianceResolve, sceneCopy };
}
