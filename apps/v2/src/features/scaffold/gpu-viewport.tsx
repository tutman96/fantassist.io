"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Eye, Grid3X3, ImageIcon, Layers3, LocateFixed, Minus, Move, Plus, PlusCircle, Redo2, RotateCcw, Ruler, Undo2 } from "lucide-react";

import { createSceneEngine } from "@/engine/scene-engine";
import type { AssetHandle, PreviewToken, ResizeHandle, SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import { createTableSession } from "@/engine/table-session";
import { synchronizeSceneEngine } from "@/features/scaffold/scene-session-channel";
import { useSharedTableSession } from "@/features/scaffold/table-session-context";
import { synchronizeTableSession } from "@/features/scaffold/table-session-channel";
import { editorCssToGrid } from "@/engine/table-camera";
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
type WorkspaceContext = "scene" | "asset";

export function GpuViewport({ profile }: { profile: RenderProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inspectorRef = useRef<HTMLDetailsElement>(null);
  const layersRef = useRef<HTMLDetailsElement>(null);
  const rendererRef = useRef<Awaited<ReturnType<typeof createBrowserSceneRenderer>>>(null);
  const sharedSession = useSharedTableSession();
  const [ownedSession] = useState(createTableSession);
  const session = sharedSession ?? ownedSession;
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

  useEffect(() => synchronizeTableSession(session, profile), [profile, session]);
  useEffect(() => synchronizeSceneEngine(engine, profile), [engine, profile]);

  useEffect(() => {
    if (profile === "editor") {
      const open = window.matchMedia("(min-width: 640px)").matches;
      if (inspectorRef.current) inspectorRef.current.open = open;
      if (layersRef.current) layersRef.current.open = open;
    }
  }, [profile]);

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
          <aside aria-label="Editor tools" className="absolute top-3 left-3 z-10 flex items-center gap-1 border border-violet-300/15 bg-[#100d20]/92 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:top-4 sm:left-4 sm:flex-col">
            <div className="mb-1 hidden size-8 place-items-center border-b border-violet-300/10 text-violet-300/60 sm:grid">
              <Move className="size-3.5" aria-hidden="true" />
            </div>
            <ToolbarButton label="Undo" shortcut="⌘Z" disabled={!sceneSnapshot.canUndo} onClick={() => engine.undo()}>
              <Undo2 />
            </ToolbarButton>
            <ToolbarButton label="Redo" shortcut="⇧⌘Z" disabled={!sceneSnapshot.canRedo} onClick={() => engine.redo()}>
              <Redo2 />
            </ToolbarButton>
            <div className="mx-1 h-6 w-px bg-gradient-to-b from-transparent via-blue-300/30 to-transparent sm:mx-0 sm:my-1 sm:h-px sm:w-6 sm:bg-gradient-to-r" />
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
            <div className="mx-1 h-6 w-px bg-gradient-to-b from-transparent via-violet-300/30 to-transparent sm:mx-0 sm:my-1 sm:h-px sm:w-6 sm:bg-gradient-to-r" />
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

          <WorkspacePanels
            inspectorRef={inspectorRef}
            layersRef={layersRef}
            context={sceneSnapshot.selectedAssetId ? "asset" : "scene"}
            engine={engine}
            sceneSnapshot={sceneSnapshot}
          />

          <div className="pointer-events-none absolute bottom-3 left-4 hidden items-center gap-2.5 text-[10px] font-medium tracking-[0.08em] text-amber-50/55 uppercase md:flex">
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
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2.5 border border-violet-300/15 bg-[#080b19]/88 px-2.5 py-1.5 font-mono text-[9px] font-medium tracking-[0.08em] text-violet-100/65 uppercase backdrop-blur-md [clip-path:polygon(6px_0,100%_0,100%_100%,0_100%,0_6px)] max-sm:hidden"
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

function WorkspacePanels({
  inspectorRef,
  layersRef,
  context,
  engine,
  sceneSnapshot,
}: {
  readonly inspectorRef: React.RefObject<HTMLDetailsElement | null>;
  readonly layersRef: React.RefObject<HTMLDetailsElement | null>;
  readonly context: WorkspaceContext;
  readonly engine: SceneEngine;
  readonly sceneSnapshot: SceneEngineSnapshot;
}) {
  const asset = sceneSnapshot.scene.assets[0];
  const contextTitle = context === "asset" ? asset.name : "Scene details";
  const contextDetail = context === "asset"
    ? `Image · revision ${sceneSnapshot.revision}`
    : "Astral Clearing · prototype";
  const revealInspector = () => {
    if (window.matchMedia("(max-width: 639px)").matches) {
      if (layersRef.current) layersRef.current.open = false;
      if (inspectorRef.current) inspectorRef.current.open = true;
    }
  };

  return (
    <>
      <details ref={inspectorRef} className="group absolute top-20 right-3 left-3 z-10 max-h-[55%] overflow-y-auto border border-violet-300/15 bg-[#100d20]/94 text-white shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:top-4 sm:right-4 sm:left-auto sm:max-h-[calc(100%-2rem)] sm:w-[19rem]">
        <PanelSummary eyebrow="Inspector" title={contextTitle} detail={contextDetail} icon={context === "asset" ? <ImageIcon /> : <Ruler />} />
        {context === "asset" ? (
          <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Selected image</p>
              <h3 className="mt-1 font-heading text-base text-amber-50">{asset.name}</h3>
            </div>
            <span className="border border-blue-300/20 bg-blue-400/5 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-blue-100/65 uppercase">Image</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-y border-violet-300/10 py-2.5">
            <Metric label="Position" value={`${asset.transform.x.toFixed(2)}, ${asset.transform.y.toFixed(2)}`} />
            <Metric label="Size" value={`${asset.transform.width.toFixed(2)} × ${asset.transform.height.toFixed(2)}`} />
            <Metric label="Rotation" value={`${asset.transform.rotation.toFixed(1)}°`} />
            <Metric label="Revision" value={String(sceneSnapshot.revision)} />
          </div>
          <div className="mt-2.5 space-y-1 text-[10px] leading-4 text-violet-100/60">
            <p><kbd className="font-mono text-blue-200/65">Shift</kbd> preserves ratio from a corner.</p>
            <p><kbd className="font-mono text-blue-200/65">Alt</kbd> mirrors resize around the center.</p>
            <p>Rotation captures 45° increments within a 5° window.</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-violet-300/10 pt-2.5">
            <PanelAction disabled>Replace media</PanelAction>
            <PanelAction disabled>Calibrate</PanelAction>
          </div>
          </div>
        ) : (
          <div className="p-3">
          <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Current scene</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-base text-amber-50">Astral Clearing</h3>
              <p className="mt-0.5 text-[10px] text-violet-100/55">Prototype scene · not persisted</p>
            </div>
            <span className="border border-violet-300/15 bg-violet-400/5 px-2 py-1 font-mono text-[9px] font-medium text-violet-100/65">1 image</span>
          </div>
          <p className="mt-3 border-t border-violet-300/10 pt-2.5 text-[10px] leading-4 text-violet-100/60">
            Select scene content to inspect its transform. Shared display calibration and screen selection live in the Open Table menu.
          </p>
          </div>
        )}
      </details>

      <details ref={layersRef} className="group absolute right-3 bottom-3 left-3 z-10 max-h-[45%] overflow-y-auto border border-violet-300/15 bg-[#100d20]/94 text-white shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:right-4 sm:bottom-4 sm:left-auto sm:w-[19rem]">
        <PanelSummary eyebrow="Layer stack" title="Scene layers" detail="1 content layer" icon={<Layers3 />} />
        <div className="p-2.5">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Content</p>
            <button disabled type="button" title="Layer creation is not available yet" aria-label="Add layer" className="grid size-7 cursor-not-allowed place-items-center border border-violet-300/12 text-violet-100/35">
              <PlusCircle className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-1">
            <LayerRow
              active={context === "asset"}
              icon={<ImageIcon />}
              name={asset.name}
              detail="Image · inferred layer"
              trailing={<Eye className="size-3.5 text-violet-200/55" aria-label="Visible" />}
              onClick={() => {
                engine.dispatch({ type: "selection.set", assetId: asset.id });
                revealInspector();
              }}
            />
          </div>
          <p className="mt-1.5 px-1 text-[10px] leading-4 text-violet-100/50">
            Ordering, visibility controls, and content insertion arrive with the persisted scene model.
          </p>
        </div>
      </details>
    </>
  );
}

function PanelSummary({ eyebrow, title, detail, icon }: { readonly eyebrow: string; readonly title: string; readonly detail: string; readonly icon: React.ReactNode }) {
  return (
    <summary className="relative cursor-pointer list-none overflow-hidden border-b border-violet-300/10 px-3 py-2.5 marker:hidden focus-visible:outline-2 focus-visible:outline-blue-400">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-400 via-violet-400 to-amber-300" />
      <div className="absolute -top-8 -right-5 size-24 rotate-12 bg-violet-500/10 blur-2xl" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-amber-100/60 uppercase">{eyebrow}</p>
          <h2 className="mt-0.5 truncate font-heading text-lg font-semibold tracking-wide text-amber-50">{title}</h2>
          <p className="mt-0.5 truncate font-mono text-[9px] tracking-wide text-violet-200/55 uppercase">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-fuchsia-300/70 [&_svg]:size-4">
          {icon}
          <ChevronDown className="size-3! text-violet-200/35 transition-transform group-open:rotate-180" aria-hidden="true" />
        </div>
      </div>
    </summary>
  );
}

function LayerRow({
  active,
  icon,
  name,
  detail,
  badge,
  trailing,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly name: string;
  readonly detail: string;
  readonly badge?: string;
  readonly trailing?: React.ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="group/layer flex min-h-11 w-full items-center gap-2.5 border border-transparent px-2 py-1.5 text-left transition hover:border-violet-300/12 hover:bg-violet-400/5 focus-visible:outline-2 focus-visible:outline-blue-400 aria-pressed:border-blue-300/20 aria-pressed:bg-gradient-to-r aria-pressed:from-blue-500/14 aria-pressed:to-violet-500/8">
      <span className="grid size-8 shrink-0 place-items-center border border-violet-300/12 bg-black/20 text-violet-200/50 group-aria-pressed/layer:border-blue-300/25 group-aria-pressed/layer:text-blue-200 [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium text-violet-50/90">{name}</span>
        <span className="block truncate font-mono text-[9px] tracking-wide text-violet-100/50 uppercase">{detail}</span>
      </span>
      {badge ? <span className="font-mono text-[9px] tracking-wide text-violet-100/50 uppercase">{badge}</span> : trailing}
    </button>
  );
}

function PanelAction({ children, onClick, disabled }: { readonly children: React.ReactNode; readonly onClick?: () => void; readonly disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="h-8 border border-violet-300/12 bg-violet-400/5 px-2 text-[10px] font-medium text-violet-100/70 transition hover:border-blue-300/25 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:text-violet-100/35 disabled:hover:border-violet-300/12">
      {children}
    </button>
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
  disabled,
  shortcut,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly shortcut?: string;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center border border-transparent text-violet-100/70 transition hover:border-violet-300/15 hover:bg-violet-400/10 hover:text-white focus-visible:outline-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:text-violet-100/30 disabled:hover:border-transparent disabled:hover:bg-transparent data-[pressed=true]:border-violet-300/25 data-[pressed=true]:bg-gradient-to-br data-[pressed=true]:from-blue-500/25 data-[pressed=true]:to-fuchsia-500/20 data-[pressed=true]:text-violet-50 [&_svg]:size-4"
      data-pressed={pressed}
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium tracking-[0.1em] text-violet-100/55 uppercase">{label}</p>
      <p className="mt-1 font-mono text-[10px] text-violet-100/85">{value}</p>
    </div>
  );
}
