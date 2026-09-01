import type { ShaderSource } from "vgpu";

import type { SceneEffect } from "@/engine/scene-document";
import { getTableBounds } from "@/engine/table-camera";
import type { DisplayConfiguration, TableCamera } from "@/engine/table-camera";
import type { SceneShaders } from "@/renderer/vgpu/scene-shaders";

export interface ParticleEffectDefinition {
  readonly kind: SceneEffect["kind"];
  readonly blend: "additive" | "premultiplied";
  readonly context: ParticleEffectContextDefinition | null;
  readonly maxParticleLifetime: number;
  readonly maxDensity: number;
  readonly guideColor: readonly [number, number, number, number];
  readonly selectedGuideColor: readonly [number, number, number, number];
  readonly drawingGuideColor: readonly [number, number, number, number];
  readonly handleColor: readonly [number, number, number, number];
  readonly drawingHandleColor: readonly [number, number, number, number];
  shader(shaders: SceneShaders): string | ShaderSource;
  particleLifetime(speed: number): number;
  liveUniforms(effect: SceneEffect): Readonly<Record<string, number | readonly number[]>>;
}

interface ParticleEffectContextDefinition {
  readonly bytesPerParticle: number;
  shader(shaders: SceneShaders): string | ShaderSource;
  params(table: TableCamera, display: DisplayConfiguration, capacity: number): Readonly<Record<string, number | readonly number[]>>;
}

export function rainVanishingPoint(table: TableCamera, display: DisplayConfiguration): readonly [number, number] {
  const bounds = getTableBounds(table, display);
  return [(bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2];
}

const DEFINITIONS: Readonly<Record<SceneEffect["kind"], ParticleEffectDefinition>> = Object.freeze({
  rain: {
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
});

export function particleEffectDefinition(effect: SceneEffect): ParticleEffectDefinition {
  return DEFINITIONS[effect.kind];
}
