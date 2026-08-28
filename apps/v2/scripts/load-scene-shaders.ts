import { resolve } from "node:path";

import { resolveShader } from "@vgpu/wgsl/runtime";

import type { SceneShaders } from "../src/renderer/vgpu/scene-shaders";

export async function loadSceneShaders(): Promise<SceneShaders> {
  const shaderDirectory = resolve("src/renderer/vgpu/shaders");
  const load = async (name: string) =>
    (await resolveShader({ entry: resolve(shaderDirectory, name), validate: "off" })).wgsl;
  const [assets, fogMask, fogComposite, fogGuide, fogHandle, composite, present] =
    await Promise.all([
      load("assets.wgsl"),
      load("fog-mask.wgsl"),
      load("fog-composite.wgsl"),
      load("fog-guide.wgsl"),
      load("fog-handle.wgsl"),
      load("composite.wgsl"),
      load("present.wgsl"),
    ]);
  return { assets, fogMask, fogComposite, fogGuide, fogHandle, composite, present };
}
