"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDown, ExternalLink, MonitorUp, Radio, ScanSearch } from "lucide-react";

import { derivePhysicalDisplay } from "@/engine/table-camera";
import { useSharedTableSession } from "@/features/scaffold/table-session-context";

interface ScreenTarget {
  readonly id: string;
  readonly label: string;
  readonly left?: number;
  readonly top?: number;
  readonly width?: number;
  readonly height?: number;
}

interface ScreenDetailsLike {
  readonly screens: readonly {
    readonly label?: string;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  }[];
}

export function TableMenu() {
  const session = useSharedTableSession();
  if (!session) return null;
  return <ConnectedTableMenu session={session} />;
}

function ConnectedTableMenu({ session }: { readonly session: NonNullable<ReturnType<typeof useSharedTableSession>> }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const physical = derivePhysicalDisplay(snapshot.display);
  const [targets, setTargets] = useState<readonly ScreenTarget[]>([
    { id: "default", label: "Default screen" },
  ]);
  const [targetId, setTargetId] = useState("default");
  const [screenStatus, setScreenStatus] = useState("Choose a detected display where supported.");

  const updateNumber = (kind: "width" | "height" | "diagonal" | "scale", value: number) => {
    if (kind === "scale") {
      session.updateConfiguration({ table: { scale: value } });
    } else if (kind === "diagonal") {
      session.updateConfiguration({ display: { diagonalInches: value } });
    } else {
      session.updateConfiguration({
        display: { resolutionPx: { ...snapshot.display.resolutionPx, [kind]: value } },
      });
    }
  };

  const detectScreens = async () => {
    const getScreenDetails = (window as Window & {
      getScreenDetails?: () => Promise<ScreenDetailsLike>;
    }).getScreenDetails;
    if (!getScreenDetails) {
      setScreenStatus("Screen selection is unavailable here. The window can be placed manually.");
      return;
    }
    try {
      const details = await getScreenDetails.call(window);
      const detected = details.screens.map((screen, index) => ({
        id: `screen-${index}`,
        label: screen.label || `Screen ${index + 1} · ${screen.width}×${screen.height}`,
        left: screen.left,
        top: screen.top,
        width: screen.width,
        height: screen.height,
      }));
      setTargets([{ id: "default", label: "Default screen" }, ...detected]);
      setScreenStatus(`${detected.length} display${detected.length === 1 ? "" : "s"} available.`);
    } catch {
      setScreenStatus("Screen access was not granted. The default screen will be used.");
    }
  };

  const openTable = () => {
    const target = targets.find((candidate) => candidate.id === targetId);
    const features = target?.left === undefined
      ? "popup=yes"
      : `popup=yes,left=${target.left},top=${target.top},width=${target.width},height=${target.height}`;
    window.open("/table", "fantassist-table", features);
  };

  return (
    <details className="group relative">
      <summary aria-label="Open table menu" className="flex h-8 cursor-pointer list-none items-center gap-2 border border-violet-300/18 bg-gradient-to-r from-blue-500/10 via-violet-500/15 to-fuchsia-500/10 px-2.5 font-medium text-amber-50 marker:hidden transition hover:border-blue-300/40 hover:from-blue-500/20 hover:to-fuchsia-500/20 focus-visible:outline-2 focus-visible:outline-blue-400">
        <Radio className="size-3.5 text-fuchsia-300" aria-hidden="true" />
        <span className="hidden text-[10px] tracking-wide sm:inline">Open table</span>
        <ChevronDown className="size-3 opacity-45 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <button
        type="button"
        aria-label="Close table menu"
        onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
        className="fixed top-12 right-0 bottom-0 left-0 z-40 hidden cursor-default bg-[#02030a]/55 backdrop-blur-[2px] group-open:block"
      />
      <div className="absolute top-10 right-0 z-50 w-[21rem] border border-violet-300/15 bg-[#100d20]/98 p-2.5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.7)] backdrop-blur-xl max-sm:fixed max-sm:top-14 max-sm:right-3 max-sm:left-3 max-sm:max-h-[calc(100svh-4.25rem)] max-sm:w-auto max-sm:overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-1 pb-2.5">
          <div>
            <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Shared display</p>
            <h2 className="mt-0.5 font-heading text-lg text-amber-50">Player table</h2>
          </div>
          <span className="border border-amber-200/18 bg-amber-100/5 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-amber-100/55 uppercase">Session</span>
        </div>

        <div className="grid grid-cols-2 gap-2 border-y border-violet-300/10 py-2.5">
          <MenuSetting label="Width" suffix="px" value={snapshot.display.resolutionPx.width} min={320} max={8192} step={1} onChange={(value) => updateNumber("width", value)} />
          <MenuSetting label="Height" suffix="px" value={snapshot.display.resolutionPx.height} min={240} max={8192} step={1} onChange={(value) => updateNumber("height", value)} />
          <MenuSetting label="Diagonal" suffix="in" value={snapshot.display.diagonalInches} min={10} max={120} step={0.1} onChange={(value) => updateNumber("diagonal", value)} />
          <MenuSetting label="Grid scale" suffix="in" value={snapshot.table.scale} min={0.1} max={10} step={0.1} onChange={(value) => updateNumber("scale", value)} />
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-violet-300/10 py-2.5">
          <MenuMetric label="Physical" value={`${physical.widthInches.toFixed(1)}×${physical.heightInches.toFixed(1)} in`} />
          <MenuMetric label="Density" value={`${physical.ppi.toFixed(1)} ppi`} />
          <MenuMetric label="Origin" value={`${snapshot.table.originGrid.x.toFixed(1)}, ${snapshot.table.originGrid.y.toFixed(1)}`} />
        </div>

        <div className="py-2.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase" htmlFor="table-screen-target">Open on</label>
            <button type="button" onClick={() => void detectScreens()} className="flex h-7 items-center gap-1.5 border border-violet-300/15 px-2 text-[9px] text-violet-100/65 transition hover:border-blue-300/30 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400">
              <ScanSearch className="size-3" aria-hidden="true" /> Detect screens
            </button>
          </div>
          <div className="relative">
            <MonitorUp className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-blue-200/55" aria-hidden="true" />
            <select id="table-screen-target" value={targetId} onChange={(event) => setTargetId(event.target.value)} className="h-9 w-full appearance-none border border-violet-300/15 bg-black/25 pr-8 pl-8 text-[11px] text-violet-50 outline-none focus:border-blue-300/35">
              {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2 text-violet-200/35" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-violet-100/55">{screenStatus}</p>
        </div>

        <button type="button" onClick={openTable} className="flex h-10 w-full items-center justify-center gap-2 border border-blue-300/25 bg-gradient-to-r from-blue-500/18 via-violet-500/20 to-fuchsia-500/15 text-[11px] font-medium text-amber-50 transition hover:border-blue-300/45 hover:from-blue-500/28 hover:to-fuchsia-500/25 focus-visible:outline-2 focus-visible:outline-blue-400">
          <Radio className="size-3.5 text-fuchsia-300" aria-hidden="true" /> Open player table
          <ExternalLink className="size-3 opacity-45" aria-hidden="true" />
        </button>
      </div>
    </details>
  );
}

function MenuSetting({ label, suffix, value, min, max, step, onChange }: { readonly label: string; readonly suffix: string; readonly value: number; readonly min: number; readonly max: number; readonly step: number; readonly onChange: (value: number) => void }) {
  const commit = (input: HTMLInputElement) => {
    if (!Number.isFinite(input.valueAsNumber)) {
      input.value = String(value);
      return;
    }
    onChange(Math.min(max, Math.max(min, input.valueAsNumber)));
  };
  return (
    <label className="grid gap-1 text-[9px] font-medium tracking-[0.1em] text-violet-100/60 uppercase">
      <span>{label}</span>
      <span className="flex h-9 items-center border border-violet-300/12 bg-black/25 focus-within:border-blue-300/35">
        <input key={value} type="number" defaultValue={value} min={min} max={max} step={step} onBlur={(event) => commit(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[11px] tracking-normal text-violet-50 outline-none" />
        <span className="pr-2 font-mono text-[9px] text-violet-200/50 lowercase">{suffix}</span>
      </span>
    </label>
  );
}

function MenuMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><p className="text-[9px] font-medium tracking-[0.1em] text-violet-100/55 uppercase">{label}</p><p className="mt-1 font-mono text-[10px] text-violet-100/80">{value}</p></div>;
}
