"use client";

import { useEffect, useRef, useState } from "react";

import { editorCssToGrid } from "@/engine/table-camera";
import type { GridPoint } from "@/engine/table-camera";
import type { AssetHandle, PreviewToken, ResizeHandle, SceneEngine, TableResizeHandle } from "@/engine/scene-engine";
import type { FogPolygonCollection } from "@/engine/scene-engine";
import { snapPointToGrid } from "@/engine/scene-engine";
import type { RainEffect, SceneLight } from "@/engine/scene-document";
import type { TableSession } from "@/engine/table-session";
import type { EditorTool, EffectTool } from "@/features/editor/editor-tool";
import { ensureEffectsLayer, ensureFogLayer } from "@/features/editor/editor-tool";
import type { RenderProfile } from "@/renderer/scene-renderer";

type PointerDrag =
  | { readonly kind: "camera"; readonly x: number; readonly y: number; readonly pointerId: number }
  | { readonly kind: "asset"; readonly pointerId: number; readonly token: PreviewToken }
  | { readonly kind: "light"; readonly pointerId: number; readonly token: PreviewToken }
  | { readonly kind: "fog-edit"; readonly pointerId: number; readonly token: PreviewToken }
  | { readonly kind: "effect-edit"; readonly pointerId: number; readonly token: PreviewToken }
  | { readonly kind: "table"; readonly pointerId: number; readonly token: PreviewToken };

interface TouchGesture {
  readonly center: GridPoint;
  readonly distance: number;
}

export function useEditorInteractions({
  assetRotation,
  canvasRef,
  engine,
  effectTool,
  onToolChange,
  profile,
  rainLayerId,
  session,
  tool,
}: {
  readonly assetRotation: number;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly engine: SceneEngine;
  readonly effectTool: EffectTool;
  readonly onToolChange: (tool: EditorTool) => void;
  readonly profile: RenderProfile;
  readonly rainLayerId?: string | null;
  readonly session: TableSession;
  readonly tool: EditorTool;
}) {
  const [hoveredHandle, setHoveredHandle] = useState<AssetHandle | null>(null);
  const [tableHandle, setTableHandle] = useState<TableResizeHandle | "move" | null>(null);
  const spacePressed = useRef(false);
  const drag = useRef<PointerDrag | null>(null);
  const fogDraft = useRef<PreviewToken | null>(null);
  const rainDraft = useRef<PreviewToken | null>(null);
  const lightDraft = useRef<{ readonly token: PreviewToken; readonly layerId: string; readonly index: number } | null>(null);
  const previousTool = useRef(tool);
  const touchPoints = useRef(new Map<number, GridPoint>());
  const touchGesture = useRef<TouchGesture | null>(null);
  const multiTouchActive = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const interactive = target?.closest("button, a, input, select, textarea, [contenteditable='true']");
      const textEditing = target?.closest("input, select, textarea, [contenteditable='true']");
      if (event.code === "Space" && !interactive) {
        spacePressed.current = true;
        event.preventDefault();
      }
      if (event.key === "Escape") {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused.closest("[aria-label='Editor tools']")) focused.blur();
        if (fogDraft.current) {
          engine.cancelPreview(fogDraft.current);
          fogDraft.current = null;
        }
        if (rainDraft.current) {
          engine.cancelPreview(rainDraft.current);
          rainDraft.current = null;
        }
        if (lightDraft.current) {
          engine.cancelPreview(lightDraft.current.token);
          lightDraft.current = null;
        }
        if (drag.current?.kind === "asset" || drag.current?.kind === "light" || drag.current?.kind === "fog-edit" || drag.current?.kind === "effect-edit" || drag.current?.kind === "table") {
          engine.cancelPreview(drag.current.token);
          drag.current = null;
        }
        const snapshot = engine.getSnapshot();
        if (snapshot.selectedAssetId) engine.dispatch({ type: "selection.set", assetId: null });
        else if (snapshot.selectedFogPolygon) engine.dispatch({ type: "fog.selection.set", selection: null });
        else if (snapshot.selectedLight) engine.dispatch({ type: "light.selection.set", selection: null });
        else if (snapshot.selectedEffect) engine.dispatch({ type: "effect.selection.set", selection: null });
        else onToolChange("assets");
      }
      if (event.key === "Enter" && !textEditing) {
        if (fogDraft.current) {
          event.preventDefault();
          const result = engine.commitFogPolygon(fogDraft.current);
          if (result.ok) fogDraft.current = null;
        } else if (rainDraft.current) {
          event.preventDefault();
          const result = engine.commitRainEffect(rainDraft.current);
          if (result.ok) rainDraft.current = null;
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !interactive) {
        event.preventDefault();
        if (event.shiftKey) engine.redo();
        else engine.undo();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !interactive) {
        const snapshot = engine.getSnapshot();
        if (snapshot.selectedAssetId) {
          event.preventDefault();
          engine.dispatch({ type: "asset.remove", assetId: snapshot.selectedAssetId });
        } else if (snapshot.selectedFogPolygon) {
          event.preventDefault();
          engine.dispatch({ type: "fog.polygon.remove", ...snapshot.selectedFogPolygon });
        } else {
          if (snapshot.selectedLight) {
            event.preventDefault();
            engine.dispatch({ type: "light.remove", layerId: snapshot.selectedLight.layerId, lightIndex: snapshot.selectedLight.lightIndex });
          } else {
            if (snapshot.selectedEffect) {
              event.preventDefault();
              engine.dispatch({ type: "effect.remove", layerId: snapshot.selectedEffect.layerId, effectId: snapshot.selectedEffect.effectId });
            }
          }
        }
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressed.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [engine, onToolChange]);

  useEffect(() => {
    if (tool !== previousTool.current && fogDraft.current) {
      engine.cancelPreview(fogDraft.current);
      fogDraft.current = null;
    }
    if (tool !== previousTool.current && rainDraft.current) {
      engine.cancelPreview(rainDraft.current);
      rainDraft.current = null;
    }
    if (tool !== previousTool.current && lightDraft.current) {
      engine.cancelPreview(lightDraft.current.token);
      lightDraft.current = null;
    }
    if (tool !== previousTool.current) engine.setFogCursor(null, "fog");
    if (tool !== previousTool.current) engine.setRainCursor(null);
    previousTool.current = tool;
  }, [engine, tool]);

  useEffect(() => engine.subscribe(() => {
    if (fogDraft.current && !engine.getSnapshot().fogDrawingActive) fogDraft.current = null;
    if (rainDraft.current && !engine.getSnapshot().effectDrawingActive) rainDraft.current = null;
    if (lightDraft.current && !engine.getSnapshot().previewActive) lightDraft.current = null;
  }), [engine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || profile !== "editor") return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = canvas.getBoundingClientRect();
        session.zoomAt(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          Math.exp(-event.deltaY * 0.003)
        );
      } else {
        session.pan({ x: -event.deltaX, y: -event.deltaY });
      }
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [canvasRef, profile, session]);

  return {
    cursor: tool === "table"
      ? cursorForTableHandle(tableHandle)
      : isPolygonTool(tool) || tool === "light"
        ? "crosshair"
        : cursorForHandle(hoveredHandle, assetRotation),
    onContextMenu(event: React.MouseEvent<HTMLCanvasElement>) {
      event.preventDefault();
    },
    onPointerLeave() {
      if (!drag.current) {
        setHoveredHandle(null);
        setTableHandle(null);
      }
      if (!fogDraft.current && isFogPolygonTool(tool)) engine.setFogCursor(null, "fog");
      if (!rainDraft.current && tool === "effects") engine.setRainCursor(null);
      if (lightDraft.current) {
        engine.cancelPreview(lightDraft.current.token);
        lightDraft.current = null;
      }
    },
    onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
      if (profile !== "editor") return;
      if (event.pointerType === "touch") {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPoints.current.size >= 2) {
          multiTouchActive.current = true;
          if (drag.current?.kind === "asset" || drag.current?.kind === "light" || drag.current?.kind === "fog-edit" || drag.current?.kind === "effect-edit" || drag.current?.kind === "table") engine.cancelPreview(drag.current.token);
          drag.current = null;
          touchGesture.current = readTouchGesture(touchPoints.current);
          return;
        }
        if (isPolygonTool(tool)) {
          const pointGrid = pointerGrid(event, session);
          if (tool === "effects") {
            if (rainDraft.current) engine.appendRainEffectVertex(rainDraft.current, pointGrid);
            else rainDraft.current = engine.beginRainEffect(rainLayerId ?? ensureEffectsLayer(engine), defaultEffect(effectTool), pointGrid);
          } else if (fogDraft.current) {
            engine.appendFogPolygonVertex(fogDraft.current, pointGrid);
          } else {
            const scene = engine.getSnapshot();
            const selected = scene.scene.layers.find((candidate) => candidate.id === scene.selectedFogLayerId && candidate.type === "fog");
            const layerId = selected?.id ?? ensureFogLayer(engine);
            fogDraft.current = engine.beginFogPolygon(layerId, polygonCollection(tool), pointGrid);
          }
          return;
        }
        if (tool === "light") {
          const point = pointerGrid(event, session);
          commitLightPlacement(engine, lightDraft, point);
          return;
        }
        if (tool === "assets") {
          const current = session.getSnapshot();
          const lightToken = engine.beginLightDrag(pointerGrid(event, session), current.editorCamera.cssPixelsPerGrid);
          if (lightToken) {
            drag.current = { kind: "light", pointerId: event.pointerId, token: lightToken };
            return;
          }
          const effectInteraction = engine.beginEffectSelectionInteraction(
            pointerGrid(event, session),
            current.editorCamera.cssPixelsPerGrid
          );
          if (effectInteraction.handled) {
            if (effectInteraction.token) drag.current = { kind: "effect-edit", pointerId: event.pointerId, token: effectInteraction.token };
            return;
          }
          const fogInteraction = engine.beginFogSelectionInteraction(
            pointerGrid(event, session),
            current.editorCamera.cssPixelsPerGrid
          );
          if (fogInteraction.handled) {
            if (fogInteraction.token) drag.current = { kind: "fog-edit", pointerId: event.pointerId, token: fogInteraction.token };
            return;
          }
        }
        const token = tool === "table"
          ? beginTableInteraction(event, engine, session)
          : beginAssetInteraction(event, engine, session);
        drag.current = token ? { kind: tool === "table" ? "table" : "asset", pointerId: event.pointerId, token } : null;
        return;
      }
      const forcePan =
        event.button === 1 ||
        event.button === 2 ||
        (event.button === 0 && spacePressed.current);
      if (!forcePan && event.button === 0) {
        if (isPolygonTool(tool)) {
          const pointGrid = pointerGrid(event, session);
          if (tool === "effects") {
            if (rainDraft.current) engine.appendRainEffectVertex(rainDraft.current, pointGrid);
            else rainDraft.current = engine.beginRainEffect(rainLayerId ?? ensureEffectsLayer(engine), defaultEffect(effectTool), pointGrid);
          } else if (fogDraft.current) {
            engine.appendFogPolygonVertex(fogDraft.current, pointGrid);
          } else {
            const scene = engine.getSnapshot();
            const selected = scene.scene.layers.find((candidate) => candidate.id === scene.selectedFogLayerId && candidate.type === "fog");
            const layerId = selected?.id ?? ensureFogLayer(engine);
            fogDraft.current = engine.beginFogPolygon(layerId, polygonCollection(tool), pointGrid);
          }
          event.preventDefault();
          return;
        }
        if (tool === "light") {
          const point = pointerGrid(event, session);
          commitLightPlacement(engine, lightDraft, point);
          event.preventDefault();
          return;
        }
        if (tool === "assets") {
          const current = session.getSnapshot();
          const lightToken = engine.beginLightDrag(pointerGrid(event, session), current.editorCamera.cssPixelsPerGrid);
          if (lightToken) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { kind: "light", pointerId: event.pointerId, token: lightToken };
            return;
          }
          const effectInteraction = engine.beginEffectSelectionInteraction(
            pointerGrid(event, session),
            current.editorCamera.cssPixelsPerGrid
          );
          if (effectInteraction.handled) {
            event.preventDefault();
            if (effectInteraction.token) {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { kind: "effect-edit", pointerId: event.pointerId, token: effectInteraction.token };
            }
            return;
          }
          const fogInteraction = engine.beginFogSelectionInteraction(
            pointerGrid(event, session),
            current.editorCamera.cssPixelsPerGrid
          );
          if (fogInteraction.handled) {
            event.preventDefault();
            if (fogInteraction.token) {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { kind: "fog-edit", pointerId: event.pointerId, token: fogInteraction.token };
            }
            return;
          }
        }
        const token = tool === "table"
          ? beginTableInteraction(event, engine, session)
          : beginAssetInteraction(event, engine, session);
        if (token) {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { kind: tool === "table" ? "table" : "asset", pointerId: event.pointerId, token };
          return;
        }
      }
      if (forcePan) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { kind: "camera", x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      }
    },
    onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
      if (isPolygonTool(tool)) {
        const point = pointerGrid(event, session);
        if (tool === "effects") {
          if (rainDraft.current) engine.updateRainEffectCursor(rainDraft.current, point);
          else engine.setRainCursor(point);
        } else if (fogDraft.current) engine.updateFogPolygonCursor(fogDraft.current, point);
        else engine.setFogCursor(point, polygonCollection(tool));
      }
      if (tool === "light" && !drag.current) updateLightPlacement(engine, lightDraft, pointerGrid(event, session));
      if (profile === "editor" && event.pointerType !== "touch" && !drag.current) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const current = session.getSnapshot();
        const pointGrid = editorCssToGrid(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          current.editorCamera,
          current.viewportCss
        );
        if (tool === "table") {
          setHoveredHandle(null);
          setTableHandle(engine.getTableInteractionHandle(
            pointGrid,
            current.editorCamera.cssPixelsPerGrid,
            current.display
          ));
        } else {
          setTableHandle(null);
          setHoveredHandle(engine.getAssetInteractionHandle(
            pointGrid,
            current.editorCamera.cssPixelsPerGrid
          ));
        }
      }
      if (event.pointerType === "touch") {
        if (!touchPoints.current.has(event.pointerId)) return;
        touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (multiTouchActive.current && touchPoints.current.size >= 2) {
          const previous = touchGesture.current;
          const next = readTouchGesture(touchPoints.current);
          if (previous && next && previous.distance > 0) {
            const bounds = event.currentTarget.getBoundingClientRect();
            session.panZoom(
              { x: previous.center.x - bounds.left, y: previous.center.y - bounds.top },
              { x: next.center.x - bounds.left, y: next.center.y - bounds.top },
              next.distance / previous.distance
            );
          }
          touchGesture.current = next;
          return;
        }
      }
      const previous = drag.current;
      if (!previous || previous.pointerId !== event.pointerId) return;
      if (previous.kind === "camera") {
        session.pan({ x: event.clientX - previous.x, y: event.clientY - previous.y });
        drag.current = { kind: "camera", x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      } else if (previous.kind === "asset") {
        const bounds = event.currentTarget.getBoundingClientRect();
        const current = session.getSnapshot();
        engine.updateAssetInteraction(
          previous.token,
          editorCssToGrid(
            { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
            current.editorCamera,
            current.viewportCss
          ),
          { fromCenter: event.altKey, preserveAspectRatio: event.shiftKey }
        );
      } else if (previous.kind === "light") {
        engine.updateLightDrag(previous.token, pointerGrid(event, session));
      } else if (previous.kind === "fog-edit") {
        engine.updateFogSelectionInteraction(previous.token, pointerGrid(event, session));
      } else if (previous.kind === "effect-edit") {
        engine.updateEffectSelectionInteraction(previous.token, pointerGrid(event, session));
      } else {
        const bounds = event.currentTarget.getBoundingClientRect();
        const current = session.getSnapshot();
        engine.updateTableInteraction(
          previous.token,
          editorCssToGrid(
            { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
            current.editorCamera,
            current.viewportCss
          )
        );
      }
    },
    onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
      if (event.pointerType === "touch") {
        touchPoints.current.delete(event.pointerId);
        touchGesture.current = readTouchGesture(touchPoints.current);
        if (multiTouchActive.current) {
          if (touchPoints.current.size === 0) multiTouchActive.current = false;
          drag.current = null;
          return;
        }
      }
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.kind === "asset" || current.kind === "light" || current.kind === "fog-edit" || current.kind === "effect-edit" || current.kind === "table") engine.commitPreview(current.token);
      drag.current = null;
    },
    onPointerCancel(event: React.PointerEvent<HTMLCanvasElement>) {
      if (event.pointerType === "touch") {
        touchPoints.current.delete(event.pointerId);
        touchGesture.current = readTouchGesture(touchPoints.current);
        if (touchPoints.current.size === 0) multiTouchActive.current = false;
      }
      if ((drag.current?.kind === "asset" || drag.current?.kind === "light" || drag.current?.kind === "fog-edit" || drag.current?.kind === "effect-edit" || drag.current?.kind === "table") && drag.current.pointerId === event.pointerId) {
        engine.cancelPreview(drag.current.token);
      }
      drag.current = null;
    },
    onDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
      if (!isPolygonTool(tool)) return;
      event.preventDefault();
      if (tool === "effects" && rainDraft.current) {
        const result = engine.commitRainEffect(rainDraft.current);
        if (result.ok) rainDraft.current = null;
      } else if (tool !== "effects" && fogDraft.current) {
        const result = engine.commitFogPolygon(fogDraft.current);
        if (result.ok) fogDraft.current = null;
      }
    },
  };
}

function pointerGrid(
  event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>,
  session: TableSession
): GridPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  const current = session.getSnapshot();
  return editorCssToGrid(
    { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    current.editorCamera,
    current.viewportCss
  );
}

function isPolygonTool(tool: EditorTool): tool is "fog" | "fog-clear" | "wall" | "effects" {
  return isFogPolygonTool(tool) || tool === "effects";
}

function isFogPolygonTool(tool: EditorTool): tool is "fog" | "fog-clear" | "wall" {
  return tool === "fog" || tool === "fog-clear" || tool === "wall";
}

function polygonCollection(tool: "fog" | "fog-clear" | "wall"): FogPolygonCollection {
  return tool === "fog" ? "fog" : tool === "fog-clear" ? "clear" : "wall";
}

function defaultEffect(effect: EffectTool): RainEffect {
  if (effect !== "rain") throw new Error(`Unsupported effect '${effect}'`);
  return {
    id: crypto.randomUUID(),
    kind: "rain",
    name: "Rain",
    visible: true,
    vertices: [],
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
    color: { r: 166, g: 211, b: 255 },
    opacity: 0.2,
    density: 3.5,
    speed: 9,
    dropSize: 0.3,
  };
}

function defaultLight(position: GridPoint): SceneLight {
  return {
    position,
    brightLightDistance: 4,
    dimLightDistance: 8,
    color: { r: 255, g: 255, b: 255, a: 255 },
  };
}

function updateLightPlacement(
  engine: SceneEngine,
  draft: React.RefObject<{ readonly token: PreviewToken; readonly layerId: string; readonly index: number } | null>,
  point: GridPoint
) {
  const snapshot = engine.getSnapshot();
  const position = snapshot.scene.table.displayGrid ? snapPointToGrid(point) : point;
  if (!draft.current) {
    const selected = snapshot.scene.layers.find((candidate) => candidate.id === snapshot.selectedFogLayerId && candidate.type === "fog");
    const layerId = selected?.id ?? ensureFogLayer(engine);
    const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layerId && candidate.type === "fog");
    const index = layer?.type === "fog" ? layer.lightSources.length : 0;
    const token = engine.beginPreview({ type: "light.insert", layerId, index, light: defaultLight(position) });
    draft.current = { token, layerId, index };
    return;
  }
  engine.updatePreview(draft.current.token, {
    type: "light.insert",
    layerId: draft.current.layerId,
    index: draft.current.index,
    light: defaultLight(position),
  });
}

function commitLightPlacement(
  engine: SceneEngine,
  draft: React.RefObject<{ readonly token: PreviewToken; readonly layerId: string; readonly index: number } | null>,
  point: GridPoint
) {
  updateLightPlacement(engine, draft, point);
  if (!draft.current) return;
  engine.commitPreview(draft.current.token);
  draft.current = null;
}

function beginTableInteraction(
  event: React.PointerEvent<HTMLCanvasElement>,
  engine: SceneEngine,
  session: TableSession
): PreviewToken | null {
  const bounds = event.currentTarget.getBoundingClientRect();
  const current = session.getSnapshot();
  const pointGrid = editorCssToGrid(
    { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    current.editorCamera,
    current.viewportCss
  );
  return engine.beginTableInteraction(
    pointGrid,
    current.editorCamera.cssPixelsPerGrid,
    current.display
  );
}

function beginAssetInteraction(
  event: React.PointerEvent<HTMLCanvasElement>,
  engine: SceneEngine,
  session: TableSession
): PreviewToken | null {
  const bounds = event.currentTarget.getBoundingClientRect();
  const current = session.getSnapshot();
  return engine.beginAssetInteraction(
    editorCssToGrid(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      current.editorCamera,
      current.viewportCss
    ),
    current.editorCamera.cssPixelsPerGrid,
    { fromCenter: event.altKey, preserveAspectRatio: event.shiftKey }
  );
}

function readTouchGesture(points: ReadonlyMap<number, GridPoint>): TouchGesture | null {
  const [first, second] = [...points.values()];
  if (!first || !second) return null;
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

const HANDLE_ANGLES: Record<ResizeHandle, number> = {
  east: 0,
  "south-east": 45,
  south: 90,
  "south-west": 135,
  west: 180,
  "north-west": 225,
  north: 270,
  "north-east": 315,
};

function cursorForHandle(handle: AssetHandle | null, rotation: number): string {
  if (!handle) return "crosshair";
  if (handle === "rotate") return "grab";
  const angle = ((HANDLE_ANGLES[handle] + rotation) % 180 + 180) % 180;
  if (angle < 22.5 || angle >= 157.5) return "ew-resize";
  if (angle < 67.5) return "nwse-resize";
  if (angle < 112.5) return "ns-resize";
  return "nesw-resize";
}

function cursorForTableHandle(handle: TableResizeHandle | "move" | null): string {
  if (handle === "move") return "move";
  if (handle === "north-west" || handle === "south-east") return "nwse-resize";
  if (handle === "north-east" || handle === "south-west") return "nesw-resize";
  return "crosshair";
}
