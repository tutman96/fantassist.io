import type { SceneEffect } from "@/engine/scene-document";
import type { EffectTool } from "@/features/editor/editor-tool";

interface EffectRange {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly fractionDigits: number;
}

export interface EditorEffectDefinition {
  readonly kind: EffectTool;
  readonly label: string;
  readonly densityMax: number;
  readonly speed: EffectRange;
  readonly size: EffectRange;
  create(id: string, seed: number): SceneEffect;
  readSize(effect: SceneEffect): number;
  writeSize(effect: SceneEffect, value: number): SceneEffect;
}

export const EDITOR_EFFECT_DEFINITIONS: Readonly<Record<EffectTool, EditorEffectDefinition>> = Object.freeze({
  rain: {
    kind: "rain",
    label: "Rain",
    densityMax: 8,
    speed: { label: "Fall speed", min: 0.5, max: 24, step: 0.5, fractionDigits: 1 },
    size: { label: "Drop size", min: 0.05, max: 2, step: 0.05, fractionDigits: 2 },
    create: (id, seed) => ({
      id, seed, kind: "rain", name: "Rain", visible: true, vertices: [],
      color: { r: 166, g: 211, b: 255 }, opacity: 0.2, density: 3.5, speed: 9, dropSize: 0.3,
    }),
    readSize: (effect) => effect.kind === "rain" ? effect.dropSize : 0,
    writeSize: (effect, dropSize) => effect.kind === "rain" ? { ...effect, dropSize } : effect,
  },
  embers: {
    kind: "embers",
    label: "Embers",
    densityMax: 6,
    speed: { label: "Lift speed", min: 0.25, max: 4, step: 0.05, fractionDigits: 2 },
    size: { label: "Spark size", min: 0.03, max: 0.5, step: 0.01, fractionDigits: 2 },
    create: (id, seed) => ({
      id, seed, kind: "embers", name: "Embers", visible: true, vertices: [],
      color: { r: 255, g: 113, b: 42 }, opacity: 0.78, density: 1.6, speed: 1.2, particleSize: 0.12,
    }),
    readSize: (effect) => effect.kind === "embers" ? effect.particleSize : 0,
    writeSize: (effect, particleSize) => effect.kind === "embers" ? { ...effect, particleSize } : effect,
  },
});

export function editorEffectDefinition(effect: SceneEffect | EffectTool): EditorEffectDefinition {
  return EDITOR_EFFECT_DEFINITIONS[typeof effect === "string" ? effect : effect.kind];
}

export function createDefaultEffect(effect: EffectTool): SceneEffect {
  return editorEffectDefinition(effect).create(
    crypto.randomUUID(),
    crypto.getRandomValues(new Uint32Array(1))[0],
  );
}
