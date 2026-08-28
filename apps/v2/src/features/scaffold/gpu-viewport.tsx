"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Grid3X3, LocateFixed, Minus, Move, Plus, RotateCcw, Ruler, Tv2 } from "lucide-react";

import { createSceneEngine } from "@/engine/scene-engine";
import type { AssetHandle, PreviewToken, ResizeHandle } from "@/engine/scene-engine";
import { createTableSession } from "@/engine/table-session";
import { synchronizeSceneEngine } from "@/features/scaffold/scene-session-channel";
import { synchronizeTableSession } from "@/features/scaffold/table-session-channel";
import { derivePhysicalDisplay, editorCssToGrid, getTableBounds } from "@/engine/table-camera";
import type { GridPoint } from "@/engine/table-camera";
import type { RenderView } from "@/renderer/projection";
import type { TableSessionSnapshot } from "@/engine/table-session";
import type { RenderProfile } from "@/renderer/scene-renderer";
import { createBrowserSceneRenderer } from "@/renderer/vgpu/browser-renderer";

type RendererStatus = "starting" | "ready" | "unsupported";
type PointerDrag =
  | { readonly kind: "camera"; readonly x: number; readonly y: number; readonly pointerId: number }
  | { readonly kind: "asset"; readonly pointerId: number; readonly token: PreviewToken };
interface TouchGesture {
  readonly center: GridPoint;
  readonly distance: number;
}

export function GpuViewport({ profile }: { profile: RenderProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Awaited<ReturnType<typeof createBrowserSceneRenderer>>>(null);
  const [session] = useState(createTableSession);
  const [engine] = useState(createSceneEngine);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const sceneSnapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [status, setStatus] = useState<RendererStatus>("starting");
  const [hoveredHandle, setHoveredHandle] = useState<AssetHandle | null>(null);
  const spacePressed = useRef(false);
  const drag = useRef<PointerDrag | null>(null);
  const touchPoints = useRef(new Map<number, GridPoint>());
  const touchGesture = useRef<TouchGesture | null>(null);
  const multiTouchActive = useRef(false);
  const physicalDisplay = derivePhysicalDisplay(snapshot.display);
  const tableBounds = getTableBounds(snapshot.table, snapshot.display);

  useEffect(() => synchronizeTableSession(session, profile), [profile, session]);
  useEffect(() => synchronizeSceneEngine(engine, profile), [engine, profile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateViewport = () => {
      const bounds = canvas.getBoundingClientRect();
      session.setViewport({ width: bounds.width, height: bounds.height });
    };
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [session]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const interactive = target?.closest("button, a, input, select, textarea, [contenteditable='true']");
      if (event.code === "Space" && !interactive) {
        spacePressed.current = true;
        event.preventDefault();
      }
      if (event.key === "Escape" && drag.current?.kind === "asset") {
        engine.cancelPreview(drag.current.token);
        drag.current = null;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let disposeRenderer: (() => void) | undefined;

    queueMicrotask(() => {
      if (disposed) return;
      const current = session.getSnapshot();
      const initialView = toRenderView(profile, current);
      void createBrowserSceneRenderer(canvas, profile, initialView, engine.getSnapshot(), () => {
        if (!disposed) setStatus("unsupported");
      })
        .then((renderer) => {
          if (disposed) {
            renderer.dispose();
            return;
          }
          rendererRef.current = renderer;
          disposeRenderer = () => {
            rendererRef.current = null;
            renderer.dispose();
          };
          setStatus("ready");
        })
        .catch((error: unknown) => {
          console.error("Unable to initialize the v2 renderer", error);
          if (!disposed) setStatus("unsupported");
        });
    });

    return () => {
      disposed = true;
      disposeRenderer?.();
    };
  }, [engine, profile, session]);

  useEffect(() => {
    rendererRef.current?.setView(toRenderView(profile, snapshot));
    rendererRef.current?.setGridVisible(
      profile === "editor" ? snapshot.editorGridVisible : snapshot.table.displayGrid
    );
    rendererRef.current?.setSnapshot(sceneSnapshot);
  }, [profile, sceneSnapshot, snapshot, status]);

  const updateNumber = (kind: "width" | "height" | "diagonal" | "scale", value: number) => {
    if (kind === "scale") {
      session.updateConfiguration({ table: { scale: value } });
    } else if (kind === "diagonal") {
      session.updateConfiguration({ display: { diagonalInches: value } });
    } else {
      session.updateConfiguration({
        display: {
          resolutionPx: {
            ...snapshot.display.resolutionPx,
            [kind]: value,
          },
        },
      });
    }
  };

  return (
    <div className="relative size-full overflow-hidden bg-[#03050d]">
      <canvas
        ref={canvasRef}
        aria-label={profile === "editor" ? "Fantassist scene editor" : "Fantassist table output"}
        data-scene-revision={sceneSnapshot.revision}
        data-asset-x={sceneSnapshot.scene.assets[0].transform.x}
        data-asset-y={sceneSnapshot.scene.assets[0].transform.y}
        data-asset-width={sceneSnapshot.scene.assets[0].transform.width}
        data-asset-height={sceneSnapshot.scene.assets[0].transform.height}
        data-asset-rotation={sceneSnapshot.scene.assets[0].transform.rotation}
        className="block size-full touch-none"
        style={{
          cursor: cursorForHandle(
            hoveredHandle,
            sceneSnapshot.scene.assets[0].transform.rotation
          ),
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerLeave={() => {
          if (!drag.current) setHoveredHandle(null);
        }}
        onPointerDown={(event) => {
          if (profile !== "editor") return;
          if (event.pointerType === "touch") {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (touchPoints.current.size >= 2) {
              multiTouchActive.current = true;
              if (drag.current?.kind === "asset") engine.cancelPreview(drag.current.token);
              drag.current = null;
              touchGesture.current = readTouchGesture(touchPoints.current);
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            const current = session.getSnapshot();
            const token = engine.beginAssetInteraction(
              editorCssToGrid(
                { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
                current.editorCamera,
                current.viewportCss
              ),
              current.editorCamera.cssPixelsPerGrid,
              { fromCenter: event.altKey, preserveAspectRatio: event.shiftKey }
            );
            drag.current = token ? { kind: "asset", pointerId: event.pointerId, token } : null;
            return;
          }
          const forcePan =
            event.button === 1 ||
            event.button === 2 ||
            (event.button === 0 && spacePressed.current);
          if (!forcePan && event.button === 0) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const current = session.getSnapshot();
            const token = engine.beginAssetInteraction(
              editorCssToGrid(
                { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
                current.editorCamera,
                current.viewportCss
              ),
              current.editorCamera.cssPixelsPerGrid,
              { fromCenter: event.altKey, preserveAspectRatio: event.shiftKey }
            );
            if (token) {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { kind: "asset", pointerId: event.pointerId, token };
              return;
            }
          }
          if (forcePan) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { kind: "camera", x: event.clientX, y: event.clientY, pointerId: event.pointerId };
          }
        }}
        onPointerMove={(event) => {
          if (profile === "editor" && event.pointerType !== "touch" && !drag.current) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const current = session.getSnapshot();
            setHoveredHandle(
              engine.getAssetInteractionHandle(
                editorCssToGrid(
                  { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
                  current.editorCamera,
                  current.viewportCss
                ),
                current.editorCamera.cssPixelsPerGrid
              )
            );
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
          } else {
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
          }
        }}
        onPointerUp={(event) => {
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
          if (current.kind === "asset") engine.commitPreview(current.token);
          drag.current = null;
        }}
        onPointerCancel={(event) => {
          if (event.pointerType === "touch") {
            touchPoints.current.delete(event.pointerId);
            touchGesture.current = readTouchGesture(touchPoints.current);
            if (touchPoints.current.size === 0) multiTouchActive.current = false;
          }
          if (drag.current?.kind === "asset" && drag.current.pointerId === event.pointerId) {
            engine.cancelPreview(drag.current.token);
          }
          drag.current = null;
        }}
        onWheel={(event) => {
          if (profile !== "editor") return;
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) {
            const bounds = event.currentTarget.getBoundingClientRect();
            session.zoomAt(
              { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
              Math.exp(-event.deltaY * 0.0015)
            );
          } else {
            session.pan({ x: -event.deltaX, y: -event.deltaY });
          }
        }}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(59,130,246,0.07),transparent_28%),radial-gradient(circle_at_83%_74%,rgba(217,70,239,0.06),transparent_30%)]" />

      {profile === "editor" ? (
        <>
          <aside className="absolute top-20 left-3 z-10 flex flex-col items-center gap-1 border border-amber-100/12 bg-[#100d20]/90 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:left-5">
            <div className="mb-1 grid size-8 place-items-center border-b border-violet-300/10 text-violet-300/60">
              <Move className="size-3.5" aria-hidden="true" />
            </div>
            <ToolbarButton label="Fit table" onClick={() => session.fitTable()}>
              <LocateFixed />
            </ToolbarButton>
            <ToolbarButton label="Reset table" onClick={() => session.resetTable()}>
              <RotateCcw />
            </ToolbarButton>
            <ToolbarButton
              label={`Grid ${snapshot.editorGridVisible ? "on" : "off"}`}
              pressed={snapshot.editorGridVisible}
              onClick={() => session.setEditorGridVisible(!snapshot.editorGridVisible)}
            >
              <Grid3X3 />
            </ToolbarButton>
            <div className="my-1 h-px w-6 bg-gradient-to-r from-transparent via-violet-300/30 to-transparent" />
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => session.zoomAt({ x: snapshot.viewportCss.width / 2, y: snapshot.viewportCss.height / 2 }, 1.15)}
              className="grid size-8 place-items-center text-violet-100/60 transition hover:bg-violet-400/10 hover:text-white focus-visible:outline-2 focus-visible:outline-violet-400 [&_svg]:size-3.5"
            >
              <Plus />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => session.zoomAt({ x: snapshot.viewportCss.width / 2, y: snapshot.viewportCss.height / 2 }, 1 / 1.15)}
              className="grid size-8 place-items-center text-violet-100/60 transition hover:bg-violet-400/10 hover:text-white focus-visible:outline-2 focus-visible:outline-violet-400 [&_svg]:size-3.5"
            >
              <Minus />
            </button>
          </aside>

          <details open className="group absolute top-20 right-3 z-10 w-[18rem] border border-amber-100/12 bg-[#100d20]/94 text-white shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl max-sm:top-auto max-sm:right-3 max-sm:bottom-16 max-sm:left-16 max-sm:w-auto sm:right-5">
            <summary className="relative cursor-pointer list-none overflow-hidden border-b border-violet-300/10 px-4 pt-4 pb-3 marker:hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-400 via-violet-400 to-amber-300" />
              <div className="absolute -top-8 -right-5 size-24 rotate-12 bg-violet-500/10 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[8px] tracking-[0.2em] text-amber-100/40 uppercase">Table portal</p>
                  <h2 className="mt-0.5 font-heading text-lg font-semibold tracking-wide text-amber-50">Player&apos;s view</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Tv2 className="size-4 text-fuchsia-300/70" aria-hidden="true" />
                  <ChevronDown className="size-3 text-violet-200/35 transition-transform group-open:rotate-180" aria-hidden="true" />
                </div>
              </div>
              <div className="relative mt-3 flex items-baseline gap-2">
                <span className="font-mono text-lg font-medium text-white">{tableBounds.width.toFixed(1)}</span>
                <span className="text-[10px] text-white/35">x</span>
                <span className="font-mono text-lg font-medium text-white">{tableBounds.height.toFixed(1)}</span>
                <span className="font-mono text-[9px] tracking-wider text-violet-200/45 uppercase">grid units</span>
              </div>
            </summary>

            <div className="p-4">
              <div className="mb-3 flex items-center gap-2 font-mono text-[8px] tracking-[0.16em] text-amber-50/35 uppercase">
                <Ruler className="size-3 text-blue-300/60" aria-hidden="true" />
                Table dimensions
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Setting label="Width" suffix="px" value={snapshot.display.resolutionPx.width} min={320} max={8192} step={1} onChange={(value) => updateNumber("width", value)} />
                <Setting label="Height" suffix="px" value={snapshot.display.resolutionPx.height} min={240} max={8192} step={1} onChange={(value) => updateNumber("height", value)} />
                <Setting label="Diagonal" suffix="in" value={snapshot.display.diagonalInches} min={10} max={120} step={0.1} onChange={(value) => updateNumber("diagonal", value)} />
                <Setting label="Grid scale" suffix="in" value={snapshot.table.scale} min={0.1} max={10} step={0.1} onChange={(value) => updateNumber("scale", value)} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-violet-300/10 pt-3">
                <Metric label="Physical width" value={`${physicalDisplay.widthInches.toFixed(1)} in`} />
                <Metric label="Physical height" value={`${physicalDisplay.heightInches.toFixed(1)} in`} />
                <Metric label="Pixel density" value={`${physicalDisplay.ppi.toFixed(1)} ppi`} />
                <Metric label="Table origin" value={`${snapshot.table.originGrid.x.toFixed(1)}, ${snapshot.table.originGrid.y.toFixed(1)}`} />
              </div>
              <p className="mt-3 text-[10px] leading-4 text-violet-100/35">
                One grid unit occupies {snapshot.table.scale.toFixed(1)} physical inch{snapshot.table.scale === 1 ? "" : "es"} on the table.
              </p>
            </div>
          </details>

          <div className="pointer-events-none absolute bottom-4 left-5 hidden items-center gap-3 text-[9px] tracking-[0.12em] text-amber-50/35 uppercase md:flex">
            <span className="text-amber-200/70">✦</span>
            <span>Drag map to move</span>
            <span className="h-3 w-px bg-violet-300/15" />
            <span>Space + drag to roam</span>
            <span className="h-3 w-px bg-violet-300/15" />
            <span>Two-finger pan + zoom</span>
          </div>
        </>
      ) : null}

      {profile === "editor" && status === "ready" ? (
        <output
          className="absolute right-5 bottom-4 flex items-center gap-3 border border-violet-300/10 bg-[#080b19]/80 px-3 py-1.5 font-mono text-[8px] tracking-[0.12em] text-violet-100/50 uppercase backdrop-blur-md [clip-path:polygon(6px_0,100%_0,100%_100%,0_100%,0_6px)] max-sm:hidden"
          data-camera-x={snapshot.editorCamera.centerGrid.x}
          data-camera-y={snapshot.editorCamera.centerGrid.y}
          data-camera-zoom={snapshot.editorCamera.cssPixelsPerGrid}
          data-scene-revision={sceneSnapshot.revision}
          data-selected-asset={sceneSnapshot.selectedAssetId ?? ""}
          data-asset-x={sceneSnapshot.scene.assets[0].transform.x}
          data-asset-y={sceneSnapshot.scene.assets[0].transform.y}
          data-asset-width={sceneSnapshot.scene.assets[0].transform.width}
          data-asset-height={sceneSnapshot.scene.assets[0].transform.height}
          data-asset-rotation={sceneSnapshot.scene.assets[0].transform.rotation}
        >
          <span>cam x {snapshot.editorCamera.centerGrid.x.toFixed(2)}</span>
          <span className="text-violet-300/20">/</span>
          <span>y {snapshot.editorCamera.centerGrid.y.toFixed(2)}</span>
          <span className="text-violet-300/20">/</span>
          <span>{snapshot.editorCamera.cssPixelsPerGrid.toFixed(1)} px / grid</span>
          <span className="text-violet-300/20">/</span>
          <span>rev {sceneSnapshot.revision}</span>
          <span className="size-1 rotate-45 bg-emerald-300 shadow-[0_0_7px_rgba(110,231,183,0.7)]" />
          <span>gpu live</span>
        </output>
      ) : null}

      {status !== "ready" ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#050713]/90 p-8 text-center text-white backdrop-blur-sm">
          <div>
            <div className="mx-auto mb-4 font-heading text-2xl text-violet-200/60">✦</div>
            <p className="font-heading text-lg font-medium tracking-wide text-violet-100">{status === "starting" ? "Conjuring the table" : "WebGPU unavailable"}</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-white/45">
              {status === "starting" ? "Prewarming the shared scene pipeline." : "Use a WebGPU-capable browser to run Fantassist v2."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toRenderView(profile: RenderProfile, snapshot: TableSessionSnapshot): RenderView {
  return profile === "editor"
    ? {
        kind: "editor",
        camera: snapshot.editorCamera,
        viewportCss: snapshot.viewportCss,
        table: snapshot.table,
        display: snapshot.display,
      }
    : { kind: "output", table: snapshot.table, display: snapshot.display };
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

function ToolbarButton({
  children,
  label,
  onClick,
  pressed,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="grid size-9 place-items-center border border-transparent text-violet-100/60 transition hover:border-violet-300/15 hover:bg-violet-400/10 hover:text-white focus-visible:outline-2 focus-visible:outline-violet-400 data-[pressed=true]:border-violet-300/25 data-[pressed=true]:bg-gradient-to-br data-[pressed=true]:from-blue-500/25 data-[pressed=true]:to-fuchsia-500/20 data-[pressed=true]:text-violet-50 [&_svg]:size-4"
      data-pressed={pressed}
    >
      {children}
    </button>
  );
}

function Setting({
  label,
  suffix,
  value,
  min,
  max,
  step,
  onChange,
}: {
  readonly label: string;
  readonly suffix: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}) {
  const commit = (input: HTMLInputElement) => {
    const parsed = input.valueAsNumber;
    if (!Number.isFinite(parsed)) {
      input.value = String(value);
      return;
    }
    onChange(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <label className="grid gap-1.5 text-[9px] tracking-[0.14em] text-violet-100/40 uppercase">
      <span>{label}</span>
      <span className="flex h-9 items-center border border-violet-300/12 bg-black/25 transition-within focus-within:border-violet-400/45 focus-within:bg-violet-400/5">
        <input
          key={value}
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          step={step}
          onBlur={(event) => commit(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = String(value);
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[11px] tracking-normal text-violet-50 outline-none"
        />
        <span className="pr-2 font-mono text-[8px] text-violet-200/25 lowercase">{suffix}</span>
      </span>
    </label>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-[8px] tracking-[0.12em] text-violet-100/30 uppercase">{label}</p>
      <p className="mt-1 font-mono text-[10px] text-violet-100/70">{value}</p>
    </div>
  );
}
