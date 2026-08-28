import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { PNG } from "pngjs";
import { init, target } from "vgpu/node";
import type { NodeAdapterMode } from "@vgpu/adapter-node";

import { createSceneEngine } from "../src/engine/scene-engine";
import { SAMPLE_ASSET_ID } from "../src/engine/scene-document";
import { DEFAULT_DISPLAY, DEFAULT_TABLE_CAMERA, fitTableCamera, getTableBounds } from "../src/engine/table-camera";
import type { RenderView } from "../src/renderer/projection";
import { createRenderPlan } from "../src/renderer/render-plan";
import type { RenderProfile } from "../src/renderer/scene-renderer";
import { createSceneExecutor } from "../src/renderer/vgpu/scene-executor";
import { loadSceneShaders } from "./load-scene-shaders";

export interface HeadlessRenderOptions {
  readonly adapter: NodeAdapterMode;
  readonly iterations?: number;
  readonly profile: RenderProfile;
  readonly size: readonly [number, number];
  readonly time: number;
  readonly selectSampleAsset?: boolean;
}

export interface HeadlessRenderResult {
  readonly pixels: Uint8Array;
  readonly diagnostics: {
    readonly adapter: { readonly mode: NodeAdapterMode; readonly name: string; readonly type: "gpu" | "cpu" };
    readonly size: readonly [number, number];
    readonly profile: RenderProfile;
    readonly time: number;
    readonly passes: readonly string[];
    readonly lightFormat: "rgba16float";
    readonly timingMethod: "cpu-wall-clock";
    readonly renderCount: number;
    readonly timingsMs: {
      readonly compile: number;
      readonly frame: number;
      readonly frameP50: number;
      readonly frameP95: number;
      readonly readback: number;
    };
    readonly estimatedTargetMemoryBytes: number;
    readonly projection: {
      readonly display: typeof DEFAULT_DISPLAY;
      readonly table: typeof DEFAULT_TABLE_CAMERA;
    };
  };
}

export async function renderHeadlessScene(options: HeadlessRenderOptions): Promise<HeadlessRenderResult> {
  const gpu = await init({ adapter: options.adapter, label: "fantassist-headless" });
  try {
    const shaders = await loadSceneShaders();
    const output = target(gpu, { size: options.size, format: "rgba8unorm", label: "headless-output" });
    const plan = createRenderPlan(options.profile);
    const viewportCss = { width: options.size[0], height: options.size[1] };
    const view: RenderView = options.profile === "editor"
      ? {
          kind: "editor",
          camera: fitTableCamera(getTableBounds(DEFAULT_TABLE_CAMERA, DEFAULT_DISPLAY), viewportCss),
          viewportCss,
          table: DEFAULT_TABLE_CAMERA,
          display: DEFAULT_DISPLAY,
        }
      : { kind: "output", table: DEFAULT_TABLE_CAMERA, display: DEFAULT_DISPLAY };
    const engine = createSceneEngine();
    if (options.selectSampleAsset) engine.dispatch({ type: "selection.set", assetId: SAMPLE_ASSET_ID });
    const executor = createSceneExecutor(gpu, output, plan, shaders, view, engine.getSnapshot());
    const compileStart = performance.now();
    await executor.prewarm();
    const compile = performance.now() - compileStart;
    const frameSamples: number[] = [];
    const iterations = options.iterations ?? 1;
    for (let index = 0; index < iterations; index++) {
      const frameStart = performance.now();
      await executor.render(options.time);
      frameSamples.push(performance.now() - frameStart);
    }
    const sortedSamples = [...frameSamples].sort((a, b) => a - b);
    const percentile = (value: number) =>
      sortedSamples[Math.max(Math.ceil(sortedSamples.length * value) - 1, 0)];
    const readbackStart = performance.now();
    const pixels = await output.read();
    const readback = performance.now() - readbackStart;
    return {
      pixels,
      diagnostics: {
        adapter: { mode: options.adapter, name: gpu.adapter.name, type: gpu.adapter.type },
        size: options.size,
        profile: options.profile,
        time: options.time,
        passes: plan.passes,
        lightFormat: executor.lightFormat,
        timingMethod: "cpu-wall-clock",
        renderCount: iterations,
        timingsMs: {
          compile,
          frame: frameSamples.reduce((total, sample) => total + sample, 0) / frameSamples.length,
          frameP50: percentile(0.5),
          frameP95: percentile(0.95),
          readback,
        },
        estimatedTargetMemoryBytes: executor.estimatedTargetBytes,
        projection: { display: DEFAULT_DISPLAY, table: DEFAULT_TABLE_CAMERA },
      },
    };
  } finally {
    gpu.dispose();
  }
}

function parseArguments(args: readonly string[]) {
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const performanceMode = args.includes("--performance");
  const sizeValue = value("--size") ?? (performanceMode ? "3840x2160" : "640x360");
  const sizeMatch = /^(\d+)x(\d+)$/.exec(sizeValue);
  if (!sizeMatch) throw new Error(`Invalid --size '${sizeValue}', expected WIDTHxHEIGHT`);
  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);
  if (width < 1 || height < 1 || width > 8192 || height > 8192) {
    throw new Error("--size dimensions must be between 1 and 8192");
  }
  const scene = value("--scene") ?? "spike";
  if (scene !== "spike") throw new Error(`Unknown scene '${scene}'`);
  const profile = value("--profile") ?? "output";
  if (profile !== "editor" && profile !== "output") throw new Error(`Invalid --profile '${profile}'`);
  const adapter = value("--adapter") ?? (process.platform === "linux" ? "software" : "auto");
  if (adapter !== "auto" && adapter !== "hardware" && adapter !== "software") {
    throw new Error(`Invalid --adapter '${adapter}'`);
  }
  const time = Number(value("--time") ?? "0");
  if (!Number.isFinite(time)) throw new Error("--time must be finite");
  return {
    adapter: adapter as NodeAdapterMode,
    iterations: performanceMode ? 20 : 1,
    profile: profile as RenderProfile,
    size: [width, height] as const,
    time,
    out: resolve(value("--out") ?? "artifacts/dynamic-lighting.png"),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await renderHeadlessScene(options);
  await mkdir(dirname(options.out), { recursive: true });
  const png = new PNG({ width: options.size[0], height: options.size[1] });
  png.data.set(result.pixels);
  await writeFile(options.out, PNG.sync.write(png));
  const diagnosticsPath = options.out.replace(/\.png$/i, "") + ".json";
  await writeFile(diagnosticsPath, JSON.stringify(result.diagnostics, null, 2) + "\n");
  console.log(JSON.stringify({ image: options.out, diagnostics: diagnosticsPath, ...result.diagnostics }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
