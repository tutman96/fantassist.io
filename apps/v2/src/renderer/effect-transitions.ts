import type { RainEffect, SceneDocument } from "@/engine/scene-document";

export const EFFECT_TRANSITION_DURATION_SECONDS = 0.24;

export interface EffectTransitionEntry {
  readonly layerId: string;
  readonly effect: RainEffect;
  readonly present: boolean;
  readonly progress: number;
  readonly target: 0 | 1;
}

export interface EffectTransitionModel {
  readonly entries: readonly EffectTransitionEntry[];
  readonly layerOrder: readonly string[];
  readonly effectOrder: ReadonlyMap<string, readonly string[]>;
  readonly currentLayerIds: ReadonlySet<string>;
}

export function createInitialEffectTransitions(scene: SceneDocument): EffectTransitionModel {
  const entries = scene.layers.flatMap((layer) => layer.type === "effects"
    ? layer.effects.map((sceneEffect) => {
        const target = layer.visible && sceneEffect.visible ? 1 : 0;
        return { layerId: layer.id, effect: sceneEffect, present: true, progress: target, target } satisfies EffectTransitionEntry;
      })
    : []);
  return {
    entries,
    layerOrder: scene.layers.map((layer) => layer.id),
    effectOrder: new Map(scene.layers.flatMap((layer) => layer.type === "effects" ? [[layer.id, layer.effects.map((effect) => effect.id)] as const] : [])),
    currentLayerIds: new Set(scene.layers.map((layer) => layer.id)),
  };
}

export function reconcileEffectTransitions(model: EffectTransitionModel, scene: SceneDocument): EffectTransitionModel {
  const currentLayers = new Map(scene.layers.map((layer) => [layer.id, layer]));
  const currentEffects = new Map(scene.layers.flatMap((layer) => layer.type === "effects"
    ? layer.effects.map((sceneEffect) => [`${layer.id}\0${sceneEffect.id}`, { layer, sceneEffect }] as const)
    : []));
  const previous = new Map(model.entries.map((entry) => [`${entry.layerId}\0${entry.effect.id}`, entry]));
  const entries: EffectTransitionEntry[] = model.entries.map((entry) => {
    const current = currentEffects.get(`${entry.layerId}\0${entry.effect.id}`);
    return current
      ? { ...entry, effect: current.sceneEffect, present: true, target: current.layer.visible && current.sceneEffect.visible ? 1 : 0 }
      : { ...entry, present: false, target: 0 };
  });
  for (const [key, current] of currentEffects) {
    if (previous.has(key)) continue;
    entries.push({
      layerId: current.layer.id,
      effect: current.sceneEffect,
      present: true,
      progress: 0,
      target: current.layer.visible && current.sceneEffect.visible ? 1 : 0,
    });
  }

  const currentOrder = scene.layers.map((layer) => layer.id);
  const exitingLayers = new Set(entries.filter((entry) => !entry.present && entry.progress > 0).map((entry) => entry.layerId));
  const layerOrder = mergeOutgoingOrder(model.layerOrder, currentOrder, exitingLayers);
  const effectOrder = new Map<string, readonly string[]>();
  for (const layerId of layerOrder) {
    const currentLayer = currentLayers.get(layerId);
    const currentIds = currentLayer?.type === "effects" ? currentLayer.effects.map((effect) => effect.id) : [];
    const exitingIds = new Set(entries.filter((entry) => entry.layerId === layerId && !entry.present && entry.progress > 0).map((entry) => entry.effect.id));
    effectOrder.set(layerId, mergeOutgoingOrder(model.effectOrder.get(layerId) ?? [], currentIds, exitingIds));
  }
  return { entries, layerOrder, effectOrder, currentLayerIds: new Set(currentOrder) };
}

export function advanceEffectTransitions(
  model: EffectTransitionModel,
  deltaSeconds: number,
  retainKeys: ReadonlySet<string> = new Set(),
): EffectTransitionModel {
  const step = Math.max(0, deltaSeconds) / EFFECT_TRANSITION_DURATION_SECONDS;
  const entries = model.entries
    .map((entry) => ({
      ...entry,
      progress: entry.target === 1 ? Math.min(1, entry.progress + step) : Math.max(0, entry.progress - step),
    }))
    .filter((entry) => entry.present || entry.progress > 0 || retainKeys.has(`${entry.layerId}\0${entry.effect.id}`));
  const activeLayerIds = new Set(entries.map((entry) => entry.layerId));
  const layerOrder = model.layerOrder.filter((layerId) => model.currentLayerIds.has(layerId) || activeLayerIds.has(layerId));
  return {
    ...model,
    entries,
    layerOrder,
    effectOrder: new Map([...model.effectOrder].filter(([layerId]) => activeLayerIds.has(layerId) || model.currentLayerIds.has(layerId))),
  };
}

export function effectTransitionIntensity(progress: number): number {
  const value = Math.min(1, Math.max(0, progress));
  return value * value * (3 - 2 * value);
}

export function hasEffectAnimationDemand(model: EffectTransitionModel): boolean {
  return model.entries.some((entry) => entry.progress !== entry.target || entry.target === 1);
}

function mergeOutgoingOrder(previous: readonly string[], current: readonly string[], outgoing: ReadonlySet<string>): string[] {
  const merged = [...current];
  for (let previousIndex = 0; previousIndex < previous.length; previousIndex++) {
    const id = previous[previousIndex];
    if (!outgoing.has(id) || merged.includes(id)) continue;
    const predecessor = previous.slice(0, previousIndex).toReversed().find((candidate) => merged.includes(candidate));
    if (predecessor) {
      merged.splice(merged.lastIndexOf(predecessor) + 1, 0, id);
      continue;
    }
    const successor = previous.slice(previousIndex + 1).find((candidate) => merged.includes(candidate));
    merged.splice(successor ? merged.indexOf(successor) : merged.length, 0, id);
  }
  return merged;
}
