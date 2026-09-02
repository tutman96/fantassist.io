import type { ShaderSource } from "vgpu";

import type { SceneEffect } from "@/engine/scene-document";
import { getTableBounds } from "@/engine/table-camera";
import type { DisplayConfiguration, TableCamera } from "@/engine/table-camera";
import type { SceneShaders } from "@/renderer/vgpu/scene-shaders";

export type ParticleSceneEffect = Extract<SceneEffect, { readonly kind: "rain" | "embers" }>;
export type CloudSceneEffect = Extract<SceneEffect, { readonly kind: "cloud" }>;
export type WallOfFireSceneEffect = Extract<SceneEffect, { readonly kind: "wall-of-fire" }>;

interface EffectRendererDefinitionBase {
  readonly kind: SceneEffect["kind"];
  readonly blend: "additive" | "premultiplied";
  readonly guideColor: readonly [number, number, number, number];
  readonly selectedGuideColor: readonly [number, number, number, number];
  readonly drawingGuideColor: readonly [number, number, number, number];
  readonly handleColor: readonly [number, number, number, number];
  readonly drawingHandleColor: readonly [number, number, number, number];
  shader(shaders: SceneShaders): string | ShaderSource;
}

export interface ParticleEffectDefinition extends EffectRendererDefinitionBase {
  readonly family: "particle";
  readonly kind: ParticleSceneEffect["kind"];
  readonly context: ParticleEffectContextDefinition | null;
  readonly maxParticleLifetime: number;
  readonly maxDensity: number;
  particleLifetime(speed: number): number;
  liveUniforms(effect: ParticleSceneEffect): Readonly<Record<string, number | readonly number[]>>;
}

export interface CloudEffectDefinition extends EffectRendererDefinitionBase {
  readonly family: "procedural-cloud";
  readonly kind: "cloud";
}

export interface PathEffectDefinition extends EffectRendererDefinitionBase {
  readonly family: "procedural-path";
  readonly kind: "wall-of-fire";
  readonly maxSparkDensity: number;
  readonly flameDensity: number;
  readonly maxSparkLifetime: number;
  sparkLifetime(speed: number): number;
  sparkShader(shaders: SceneShaders): string | ShaderSource;
  flameShader(shaders: SceneShaders): string | ShaderSource;
  sparkContextShader(shaders: SceneShaders): string | ShaderSource;
}

export type EffectRendererDefinition = ParticleEffectDefinition | CloudEffectDefinition | PathEffectDefinition;

interface ParticleEffectContextDefinition {
  readonly bytesPerParticle: number;
  shader(shaders: SceneShaders): string | ShaderSource;
  params(table: TableCamera, display: DisplayConfiguration, capacity: number): Readonly<Record<string, number | readonly number[]>>;
}

export function rainVanishingPoint(table: TableCamera, display: DisplayConfiguration): readonly [number, number] {
  const bounds = getTableBounds(table, display);
  return [(bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2];
}

const DEFINITIONS: Readonly<Record<SceneEffect["kind"], EffectRendererDefinition>> = Object.freeze({
  rain: {
    family: "particle",
    kind: "rain",
    blend: "premultiplied",
    context: {
      bytesPerParticle: 16,
      shader: (shaders) => shaders.rainContext,
      params: (table, display, capacity) => ({ vanishing_point: rainVanishingPoint(table, display), capacity }),
    },
    maxParticleLifetime: 1 / (0.5 * 0.45 * 0.48),
    maxDensity: 8,
    guideColor: [0.034, 0.302, 0.344, 0.42],
    selectedGuideColor: [0.114, 0.855, 0.95, 0.95],
    drawingGuideColor: [0.22, 1, 1, 1],
    handleColor: [0.18, 0.92, 1, 1],
    drawingHandleColor: [0.35, 1, 1, 1],
    shader: (shaders) => shaders.rain,
    particleLifetime: (speed) => 1 / (Math.max(speed, 0.5) * 0.45 * 0.48),
    liveUniforms: (effect) => ({ drop_size: effect.kind === "rain" ? Math.max(effect.dropSize, 0) : 0 }),
  },
  embers: {
    family: "particle",
    kind: "embers",
    blend: "additive",
    context: null,
    maxParticleLifetime: 3.6 / 0.25,
    maxDensity: 6,
    guideColor: [0.42, 0.16, 0.035, 0.42],
    selectedGuideColor: [1, 0.42, 0.12, 0.95],
    drawingGuideColor: [1, 0.64, 0.18, 1],
    handleColor: [1, 0.38, 0.1, 1],
    drawingHandleColor: [1, 0.72, 0.22, 1],
    shader: (shaders) => shaders.embers,
    particleLifetime: (speed) => 3.6 / Math.max(speed, 0.25),
    liveUniforms: (effect) => ({ particle_size: effect.kind === "embers" ? Math.max(effect.particleSize, 0) : 0 }),
  },
  cloud: {
    family: "procedural-cloud",
    kind: "cloud",
    blend: "premultiplied",
    guideColor: [0.24, 0.25, 0.29, 0.5],
    selectedGuideColor: [0.72, 0.76, 0.84, 0.95],
    drawingGuideColor: [0.88, 0.9, 0.96, 1],
    handleColor: [0.66, 0.7, 0.78, 1],
    drawingHandleColor: [0.9, 0.92, 0.98, 1],
    shader: (shaders) => shaders.cloud,
  },
  "wall-of-fire": {
    family: "procedural-path",
    kind: "wall-of-fire",
    blend: "premultiplied",
    maxSparkDensity: 8,
    flameDensity: 40,
    maxSparkLifetime: 2.4 / 0.5,
    guideColor: [0.48, 0.15, 0.025, 0.55],
    selectedGuideColor: [1, 0.42, 0.08, 0.95],
    drawingGuideColor: [1, 0.72, 0.16, 1],
    handleColor: [1, 0.34, 0.06, 1],
    drawingHandleColor: [1, 0.78, 0.2, 1],
    shader: (shaders) => shaders.wallOfFire,
    sparkShader: (shaders) => shaders.wallOfFireSparks,
    flameShader: (shaders) => shaders.wallOfFireFlames,
    sparkContextShader: (shaders) => shaders.wallOfFireContext,
    sparkLifetime: (speed) => 2.4 / Math.max(speed, 0.5),
  },
});

export function effectRendererDefinition(effect: SceneEffect): EffectRendererDefinition {
  return DEFINITIONS[effect.kind];
}

export function isParticleEffect(effect: SceneEffect): effect is ParticleSceneEffect {
  return effect.kind === "rain" || effect.kind === "embers";
}
