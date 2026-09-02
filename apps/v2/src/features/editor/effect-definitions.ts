import type { CloudEffect, SceneEffect } from "@/engine/scene-document";
import type { EffectTool } from "@/features/editor/editor-tool";

export interface EditorEffectControl {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  read(effect: SceneEffect): number;
  write(effect: SceneEffect, value: number): SceneEffect;
  display(value: number): string;
}

export interface EditorEffectDefinition {
  readonly kind: EffectTool;
  readonly label: string;
  readonly iconClassName: string;
  readonly controls: readonly EditorEffectControl[];
  create(id: string, seed: number): SceneEffect;
}

export const EDITOR_EFFECT_DEFINITIONS: Readonly<Record<EffectTool, EditorEffectDefinition>> = Object.freeze({
  rain: {
    kind: "rain",
    label: "Rain",
    iconClassName: "size-3 text-cyan-100/70",
    controls: [
      effectControl("Emission density", 0.1, 8, 0.1, 1, " / grid² / s", (effect) => effect.kind === "rain" ? effect.density : 0, (effect, density) => effect.kind === "rain" ? { ...effect, density } : effect),
      effectControl("Fall speed", 0.5, 24, 0.5, 1, "", (effect) => effect.kind === "rain" ? effect.speed : 0, (effect, speed) => effect.kind === "rain" ? { ...effect, speed } : effect),
      effectControl("Drop size", 0.05, 2, 0.05, 2, " grid", (effect) => effect.kind === "rain" ? effect.dropSize : 0, (effect, dropSize) => effect.kind === "rain" ? { ...effect, dropSize } : effect),
    ],
    create: (id, seed) => ({
      id, seed, kind: "rain", name: "Rain", visible: true, vertices: [],
      color: { r: 166, g: 211, b: 255 }, opacity: 0.2, density: 3.5, speed: 9, dropSize: 0.3,
    }),
  },
  embers: {
    kind: "embers",
    label: "Embers",
    iconClassName: "size-3 text-orange-300/80",
    controls: [
      effectControl("Emission density", 0.1, 6, 0.1, 1, " / grid² / s", (effect) => effect.kind === "embers" ? effect.density : 0, (effect, density) => effect.kind === "embers" ? { ...effect, density } : effect),
      effectControl("Lift speed", 0.25, 4, 0.05, 2, "", (effect) => effect.kind === "embers" ? effect.speed : 0, (effect, speed) => effect.kind === "embers" ? { ...effect, speed } : effect),
      effectControl("Spark size", 0.03, 0.5, 0.01, 2, " grid", (effect) => effect.kind === "embers" ? effect.particleSize : 0, (effect, particleSize) => effect.kind === "embers" ? { ...effect, particleSize } : effect),
    ],
    create: (id, seed) => ({
      id, seed, kind: "embers", name: "Embers", visible: true, vertices: [],
      color: { r: 255, g: 113, b: 42 }, opacity: 0.78, density: 1.6, speed: 1.2, particleSize: 0.12,
    }),
  },
  cloud: {
    kind: "cloud",
    label: "Cloud",
    iconClassName: "size-3 text-slate-200/75",
    controls: [
      effectControl("Coverage", 0, 100, 1, 0, "%", (effect) => effect.kind === "cloud" ? effect.coverage * 100 : 0, (effect, coverage) => effect.kind === "cloud" ? { ...effect, coverage: coverage / 100 } : effect),
      effectControl("Drift speed", 0.02, 2.5, 0.02, 2, " grid / s", (effect) => effect.kind === "cloud" ? effect.speed : 0, (effect, speed) => effect.kind === "cloud" ? { ...effect, speed } : effect),
      effectControl("Cloud scale", 0.25, 12, 0.25, 2, " grid", (effect) => effect.kind === "cloud" ? effect.scale : 0, (effect, scale) => effect.kind === "cloud" ? { ...effect, scale } : effect),
      effectControl("Turbulence", 0, 100, 1, 0, "%", (effect) => effect.kind === "cloud" ? effect.turbulence * 100 : 0, (effect, turbulence) => effect.kind === "cloud" ? { ...effect, turbulence: turbulence / 100 } : effect),
    ],
    create: (id, seed) => ({
      id, seed, kind: "cloud", name: "Cloud", visible: true, vertices: [],
      color: { r: 96, g: 101, b: 110 }, opacity: 0.64, coverage: 0.58, speed: 0.18, scale: 3, turbulence: 0.65,
    }),
  },
});

export const CLOUD_PRESETS: readonly { readonly name: string; readonly effect: Pick<CloudEffect, "color" | "opacity" | "coverage" | "speed" | "scale" | "turbulence"> }[] = [
  { name: "Smoke", effect: { color: { r: 96, g: 101, b: 110 }, opacity: 0.64, coverage: 0.58, speed: 0.18, scale: 3, turbulence: 0.65 } },
  { name: "Poison", effect: { color: { r: 91, g: 166, b: 82 }, opacity: 0.58, coverage: 0.55, speed: 0.12, scale: 2.5, turbulence: 0.8 } },
  { name: "Mist", effect: { color: { r: 190, g: 207, b: 218 }, opacity: 0.34, coverage: 0.72, speed: 0.08, scale: 5, turbulence: 0.35 } },
  { name: "Dust", effect: { color: { r: 171, g: 128, b: 84 }, opacity: 0.5, coverage: 0.5, speed: 0.3, scale: 3.5, turbulence: 0.55 } },
];

function effectControl(
  label: string,
  min: number,
  max: number,
  step: number,
  fractionDigits: number,
  suffix: string,
  read: EditorEffectControl["read"],
  write: EditorEffectControl["write"],
): EditorEffectControl {
  return { label, min, max, step, read, write, display: (value) => `${value.toFixed(fractionDigits)}${suffix}` };
}

export function editorEffectDefinition(effect: SceneEffect | EffectTool): EditorEffectDefinition {
  return EDITOR_EFFECT_DEFINITIONS[typeof effect === "string" ? effect : effect.kind];
}

export function createDefaultEffect(effect: EffectTool): SceneEffect {
  return editorEffectDefinition(effect).create(
    crypto.randomUUID(),
    crypto.getRandomValues(new Uint32Array(1))[0],
  );
}
