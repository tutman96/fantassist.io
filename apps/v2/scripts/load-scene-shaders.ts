import { resolve } from "node:path";

import { resolveShader } from "@vgpu/wgsl/runtime";

import type { SceneShaders } from "../src/renderer/vgpu/scene-shaders";

export async function loadSceneShaders(): Promise<SceneShaders> {
  const shaderDirectory = resolve("src/renderer/vgpu/shaders");
  const load = async (name: string) =>
    (await resolveShader({ entry: resolve(shaderDirectory, name), validate: "off" })).wgsl;
  const [assets, fogMask, obstructionShadows, lightAccumulation, composite, present] =
    await Promise.all([
      load("assets.wgsl"),
      load("fog-mask.wgsl"),
      load("obstruction-shadows.wgsl"),
      load("light-accumulation.wgsl"),
      load("composite.wgsl"),
      load("present.wgsl"),
    ]);
  return { assets, fogMask, obstructionShadows, lightAccumulation, composite, present };
}
