import type { SceneEngine } from "@/engine/scene-engine";

export type EditorTool = "assets" | "fog" | "fog-clear" | "wall" | "light" | "effects" | "table";
export type EffectTool = "rain";

export function ensureFogLayer(engine: SceneEngine, createId: () => string = () => crypto.randomUUID()): string {
  const existing = [...engine.getSnapshot().scene.layers].reverse().find((layer) => layer.type === "fog");
  if (existing) {
    engine.dispatch({ type: "fog.layer.select", layerId: existing.id });
    return existing.id;
  }
  const id = createId();
  const result = engine.dispatch({
    type: "layer.insert",
    layer: {
      id,
      name: "Fog",
      type: "fog",
      visible: true,
      assetIds: [],
      fogPolygons: [],
      fogClearPolygons: [],
      obstructionPolygons: [],
      lightSources: [],
    },
  });
  if (!result.ok) throw new Error(result.error);
  engine.dispatch({ type: "fog.layer.select", layerId: id });
  return id;
}

export function ensureEffectsLayer(engine: SceneEngine, createId: () => string = () => crypto.randomUUID()): string {
  const existing = [...engine.getSnapshot().scene.layers].reverse().find((layer) => layer.type === "effects");
  if (existing) return existing.id;
  const id = createId();
  const result = engine.dispatch({
    type: "layer.insert",
    layer: { id, name: "Effects", type: "effects", visible: true, effects: [] },
  });
  if (!result.ok) throw new Error(result.error);
  return id;
}
