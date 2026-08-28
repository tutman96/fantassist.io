"use client";

import { useEffect, useRef, useState } from "react";

import { editorCssToGrid } from "@/engine/table-camera";
import type { GridPoint } from "@/engine/table-camera";
import type { AssetHandle, PreviewToken, ResizeHandle, SceneEngine, TableResizeHandle } from "@/engine/scene-engine";
import type { TableSession } from "@/engine/table-session";
import type { EditorTool } from "@/features/editor/editor-tool";
import type { RenderProfile } from "@/renderer/scene-renderer";

type PointerDrag =
  | { readonly kind: "camera"; readonly x: number; readonly y: number; readonly pointerId: number }
  | { readonly kind: "asset"; readonly pointerId: number; readonly token: PreviewToken }
  | { readonly kind: "table"; readonly pointerId: number; readonly token: PreviewToken };

interface TouchGesture {
  readonly center: GridPoint;
  readonly distance: number;
}

export function useEditorInteractions({
  assetRotation,
  engine,
  profile,
  session,
  tool,
}: {
  readonly assetRotation: number;
  readonly engine: SceneEngine;
  readonly profile: RenderProfile;
  readonly session: TableSession;
  readonly tool: EditorTool;
}) {
  const [hoveredHandle, setHoveredHandle] = useState<AssetHandle | null>(null);
  const [tableHandle, setTableHandle] = useState<TableResizeHandle | "move" | null>(null);
  const spacePressed = useRef(false);
  const drag = useRef<PointerDrag | null>(null);
  const fogDraft = useRef<PreviewToken | null>(null);
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
      if (event.key === "Escape" && fogDraft.current) {
        engine.cancelPreview(fogDraft.current);
        fogDraft.current = null;
      } else if (event.key === "Escape" && (drag.current?.kind === "asset" || drag.current?.kind === "table")) {
        engine.cancelPreview(drag.current.token);
        drag.current = null;
      }
      if (event.key === "Enter" && fogDraft.current && !textEditing) {
        event.preventDefault();
        engine.commitFogPolygon(fogDraft.current);
        fogDraft.current = null;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !interactive) {
        event.preventDefault();
        if (event.shiftKey) engine.redo();
        else engine.undo();
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
  }, [engine]);

  useEffect(() => {
    if (tool !== previousTool.current && fogDraft.current) {
      engine.cancelPreview(fogDraft.current);
      fogDraft.current = null;
    }
    previousTool.current = tool;
  }, [engine, tool]);

  useEffect(() => engine.subscribe(() => {
    if (fogDraft.current && !engine.getSnapshot().fogDrawingActive) fogDraft.current = null;
  }), [engine]);

  return {
    cursor: tool === "table"
      ? cursorForTableHandle(tableHandle)
      : tool === "fog" || tool === "fog-clear"
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
    },
    onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
      if (profile !== "editor") return;
      if (event.pointerType === "touch") {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPoints.current.size >= 2) {
          multiTouchActive.current = true;
          if (drag.current?.kind === "asset" || drag.current?.kind === "table") engine.cancelPreview(drag.current.token);
          drag.current = null;
          touchGesture.current = readTouchGesture(touchPoints.current);
          return;
        }
        if (tool === "fog" || tool === "fog-clear") {
          const pointGrid = pointerGrid(event, session);
          if (fogDraft.current) {
            engine.appendFogPolygonVertex(fogDraft.current, pointGrid);
          } else {
            const scene = engine.getSnapshot();
            const layer = scene.scene.layers.find((candidate) => candidate.id === scene.selectedFogLayerId && candidate.type === "fog")
              ?? [...scene.scene.layers].reverse().find((candidate) => candidate.type === "fog" && candidate.visible);
            if (layer) {
              engine.dispatch({ type: "fog.layer.select", layerId: layer.id });
              fogDraft.current = engine.beginFogPolygon(layer.id, tool === "fog" ? "fog" : "clear", pointGrid);
            }
          }
          return;
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
        if (tool === "fog" || tool === "fog-clear") {
          const pointGrid = pointerGrid(event, session);
          if (fogDraft.current) {
            engine.appendFogPolygonVertex(fogDraft.current, pointGrid);
          } else {
            const scene = engine.getSnapshot();
            const layer = scene.scene.layers.find((candidate) => candidate.id === scene.selectedFogLayerId && candidate.type === "fog")
              ?? [...scene.scene.layers].reverse().find((candidate) => candidate.type === "fog" && candidate.visible);
            if (!layer) return;
            engine.dispatch({ type: "fog.layer.select", layerId: layer.id });
            fogDraft.current = engine.beginFogPolygon(layer.id, tool === "fog" ? "fog" : "clear", pointGrid);
          }
          event.preventDefault();
          return;
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
      if (fogDraft.current && (tool === "fog" || tool === "fog-clear")) {
        engine.updateFogPolygonCursor(fogDraft.current, pointerGrid(event, session));
      }
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
      if (current.kind === "asset" || current.kind === "table") engine.commitPreview(current.token);
      drag.current = null;
    },
    onPointerCancel(event: React.PointerEvent<HTMLCanvasElement>) {
      if (event.pointerType === "touch") {
        touchPoints.current.delete(event.pointerId);
        touchGesture.current = readTouchGesture(touchPoints.current);
        if (touchPoints.current.size === 0) multiTouchActive.current = false;
      }
      if ((drag.current?.kind === "asset" || drag.current?.kind === "table") && drag.current.pointerId === event.pointerId) {
        engine.cancelPreview(drag.current.token);
      }
      drag.current = null;
    },
    onDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
      if (!fogDraft.current || (tool !== "fog" && tool !== "fog-clear")) return;
      event.preventDefault();
      engine.commitFogPolygon(fogDraft.current);
      fogDraft.current = null;
    },
    onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
      if (profile !== "editor") return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const pointerCss = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        session.zoomAt(pointerCss, Math.exp(-event.deltaY * 0.0015));
      } else {
        session.pan({ x: -event.deltaX, y: -event.deltaY });
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
