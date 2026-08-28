"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Grid3X3, LocateFixed, Minus, Move, Plus, RotateCcw, Ruler, Tv2 } from "lucide-react";

import { createTableSession } from "@/engine/table-session";
import { synchronizeTableSession } from "@/features/scaffold/table-session-channel";
import { derivePhysicalDisplay, getTableBounds } from "@/engine/table-camera";
import type { RenderView } from "@/renderer/projection";
import type { TableSessionSnapshot } from "@/engine/table-session";
import type { RenderProfile } from "@/renderer/scene-renderer";
import { createBrowserSceneRenderer } from "@/renderer/vgpu/browser-renderer";

type RendererStatus = "starting" | "ready" | "unsupported";

export function GpuViewport({ profile }: { profile: RenderProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Awaited<ReturnType<typeof createBrowserSceneRenderer>>>(null);
  const [session] = useState(createTableSession);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [status, setStatus] = useState<RendererStatus>("starting");
  const spacePressed = useRef(false);
  const drag = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const physicalDisplay = derivePhysicalDisplay(snapshot.display);
  const tableBounds = getTableBounds(snapshot.table, snapshot.display);

  useEffect(() => synchronizeTableSession(session, profile), [profile, session]);

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
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let disposeRenderer: (() => void) | undefined;

    queueMicrotask(() => {
      if (disposed) return;
      const current = session.getSnapshot();
      const initialView = toRenderView(profile, current);
      void createBrowserSceneRenderer(canvas, profile, initialView, () => {
        if (!disposed) setStatus("unsupported");
      })
        .then((renderer) => {
          if (disposed) {
            renderer.dispose();
            return;
          }
          const stopAnimation = renderer.startAnimation(30);
          rendererRef.current = renderer;
          disposeRenderer = () => {
            rendererRef.current = null;
            stopAnimation();
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
  }, [profile, session]);

  useEffect(() => {
    rendererRef.current?.setView(toRenderView(profile, snapshot));
    rendererRef.current?.setGridVisible(
      profile === "editor" ? snapshot.editorGridVisible : snapshot.table.displayGrid
    );
  }, [profile, snapshot, status]);

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
        className="block size-full touch-none cursor-crosshair"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (profile !== "editor") return;
          const shouldPan =
            event.pointerType === "touch" ||
            event.button === 1 ||
            event.button === 2 ||
            (event.button === 0 && spacePressed.current);
          if (!shouldPan) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        }}
        onPointerMove={(event) => {
          const previous = drag.current;
          if (!previous || previous.pointerId !== event.pointerId) return;
          session.pan({ x: event.clientX - previous.x, y: event.clientY - previous.y });
          drag.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
        }}
        onPointerCancel={() => {
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
            <span>Space + drag to roam</span>
            <span className="h-3 w-px bg-violet-300/15" />
            <span>Scroll to zoom</span>
          </div>
        </>
      ) : null}

      {profile === "editor" && status === "ready" ? (
        <output
          className="absolute right-5 bottom-4 flex items-center gap-3 border border-violet-300/10 bg-[#080b19]/80 px-3 py-1.5 font-mono text-[8px] tracking-[0.12em] text-violet-100/50 uppercase backdrop-blur-md [clip-path:polygon(6px_0,100%_0,100%_100%,0_100%,0_6px)] max-sm:hidden"
          data-camera-x={snapshot.editorCamera.centerGrid.x}
          data-camera-y={snapshot.editorCamera.centerGrid.y}
          data-camera-zoom={snapshot.editorCamera.cssPixelsPerGrid}
        >
          <span>cam x {snapshot.editorCamera.centerGrid.x.toFixed(2)}</span>
          <span className="text-violet-300/20">/</span>
          <span>y {snapshot.editorCamera.centerGrid.y.toFixed(2)}</span>
          <span className="text-violet-300/20">/</span>
          <span>{snapshot.editorCamera.cssPixelsPerGrid.toFixed(1)} px / grid</span>
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
