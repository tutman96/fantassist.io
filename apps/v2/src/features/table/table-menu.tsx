"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDown, ExternalLink, MonitorUp, Radio, ScanSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PopoverUnderlay } from "@/components/popover-underlay";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { derivePhysicalDisplay } from "@/engine/table-camera";
import { useEditorScene } from "@/features/scenes/editor-scene-context";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { Metric, NumberSettingField } from "@/features/table/table-menu-parts";
import { useScreenTargets } from "@/features/table/use-screen-targets";

export function TableMenu() {
  const session = useSharedTableSession();
  const editorScene = useEditorScene();
  if (!session || !editorScene) return null;
  return <ConnectedTableMenu session={session} engine={editorScene.engine} />;
}

function ConnectedTableMenu({ session, engine }: {
  readonly session: NonNullable<ReturnType<typeof useSharedTableSession>>;
  readonly engine: NonNullable<ReturnType<typeof useEditorScene>>["engine"];
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const sceneSnapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const table = sceneSnapshot.scene.table;
  const physical = derivePhysicalDisplay(snapshot.display);
  const [open, setOpen] = useState(false);
  const { targets, targetId, setTargetId, status, detectScreens, openTable } = useScreenTargets();

  const updateNumber = (kind: "width" | "height" | "diagonal" | "scale", value: number) => {
    if (kind === "scale") {
      engine.dispatch({ type: "table.camera", table: { ...table, scale: value } });
    } else if (kind === "diagonal") {
      session.updateConfiguration({ display: { diagonalInches: value } });
    } else {
      session.updateConfiguration({
        display: { resolutionPx: { ...snapshot.display.resolutionPx, [kind]: value } },
      });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label="Open table menu"
          className="h-8 gap-2 rounded-none border-violet-300/18 bg-gradient-to-r from-blue-500/10 via-violet-500/15 to-fuchsia-500/10 px-2.5 text-amber-50 hover:border-blue-300/40 hover:from-blue-500/20 hover:to-fuchsia-500/20 hover:text-amber-50"
        >
          <Radio className="size-3.5 text-fuchsia-300" aria-hidden="true" />
          <span className="hidden text-[10px] tracking-wide sm:inline">Open table</span>
          <ChevronDown className={`size-3 opacity-45 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {open && (
        <PopoverUnderlay
          label="Close table menu"
          onClick={() => setOpen(false)}
          className="z-40"
        />
      )}
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="z-50 max-h-[calc(100svh-4.25rem)] w-[21rem] gap-0 overflow-y-auto rounded-none border border-violet-300/15 bg-[#100d20]/98 p-2.5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.7)] ring-0 backdrop-blur-xl max-sm:w-[calc(100vw-1.5rem)]"
      >
        <div className="flex items-start justify-between gap-3 px-1 pb-2.5">
          <div>
            <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Shared display</p>
            <h2 className="mt-0.5 font-heading text-lg text-amber-50">Player table</h2>
          </div>
          <Badge variant="outline" className="h-auto rounded-none border-amber-200/18 bg-amber-100/5 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-amber-100/55 uppercase">Session</Badge>
        </div>

        <Separator className="bg-violet-300/10" />
        <div className="grid grid-cols-2 gap-2 py-2.5">
          <NumberSettingField label="Width" suffix="px" value={snapshot.display.resolutionPx.width} min={320} max={8192} step={1} onChange={(value) => updateNumber("width", value)} />
          <NumberSettingField label="Height" suffix="px" value={snapshot.display.resolutionPx.height} min={240} max={8192} step={1} onChange={(value) => updateNumber("height", value)} />
          <NumberSettingField label="Diagonal" suffix="in" value={snapshot.display.diagonalInches} min={10} max={120} step={0.1} onChange={(value) => updateNumber("diagonal", value)} />
          <NumberSettingField label="Grid scale" suffix="in" value={table.scale} min={0.1} max={10} step={0.1} onChange={(value) => updateNumber("scale", value)} />
        </div>

        <Separator className="bg-violet-300/10" />
        <div className="grid grid-cols-3 gap-2 py-2.5">
          <Metric label="Physical" value={`${physical.widthInches.toFixed(1)}×${physical.heightInches.toFixed(1)} in`} />
          <Metric label="Density" value={`${physical.ppi.toFixed(1)} ppi`} />
          <Metric label="Origin" value={`${table.originGrid.x.toFixed(1)}, ${table.originGrid.y.toFixed(1)}`} />
        </div>

        <Separator className="bg-violet-300/10" />
        <div className="py-2.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase" htmlFor="table-screen-target">Open on</label>
            <Button variant="outline" size="sm" type="button" onClick={() => void detectScreens()} className="h-7 rounded-none border-violet-300/15 bg-transparent px-2 text-[9px] text-violet-100/65 hover:border-blue-300/30 hover:bg-transparent hover:text-white">
              <ScanSearch className="size-3" aria-hidden="true" /> Detect screens
            </Button>
          </div>
          <div className="relative">
            <MonitorUp className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-blue-200/55" aria-hidden="true" />
            <NativeSelect
              id="table-screen-target"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="w-full [&_[data-slot=native-select]]:h-9 [&_[data-slot=native-select]]:rounded-none! [&_[data-slot=native-select]]:border-violet-300/15 [&_[data-slot=native-select]]:bg-black/25 [&_[data-slot=native-select]]:pl-8 [&_[data-slot=native-select]]:text-[11px] [&_[data-slot=native-select]]:text-violet-50"
            >
              {targets.map((target) => <NativeSelectOption key={target.id} value={target.id}>{target.label}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <p role="status" aria-live="polite" className="mt-1.5 text-[10px] leading-4 text-violet-100/55">{status}</p>
        </div>

        <Button type="button" onClick={openTable} className="h-10 w-full rounded-none border border-blue-300/25 bg-gradient-to-r from-blue-500/18 via-violet-500/20 to-fuchsia-500/15 text-[11px] text-amber-50 hover:border-blue-300/45 hover:from-blue-500/28 hover:to-fuchsia-500/25">
          <Radio className="size-3.5 text-fuchsia-300" aria-hidden="true" /> Open player table
          <ExternalLink className="size-3 opacity-45" aria-hidden="true" />
        </Button>
      </PopoverContent>
    </Popover>
  );
}
