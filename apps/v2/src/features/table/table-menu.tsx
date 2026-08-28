"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ExternalLink, MonitorUp, Radio, ScanSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PopoverUnderlay } from "@/components/popover-underlay";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { derivePhysicalDisplay } from "@/engine/table-camera";
import { useEditorScene } from "@/features/scenes/editor-scene-context";
import { RESOLUTION_PRESETS, resolutionPresetId, TV_SIZE_PRESETS, tvSizePresetId } from "@/features/table/table-display-options";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { Metric, NumberSettingField } from "@/features/table/table-menu-parts";
import { useScreenTargets } from "@/features/table/use-screen-targets";
import type { ScreenTarget } from "@/features/table/use-screen-targets";
import { createV1Repositories } from "@/persistence/v1/repositories";

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
  const [repositories] = useState(createV1Repositories);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [customResolution, setCustomResolution] = useState(false);
  const [customSize, setCustomSize] = useState(false);
  const [displayChosen, setDisplayChosen] = useState(false);
  const [rememberedTargetId, setRememberedTargetId] = useState<string | null>(null);
  const table = sceneSnapshot.scene.table;
  const physical = derivePhysicalDisplay(snapshot.display);
  const [open, setOpen] = useState(false);
  const { targets, targetId, setTargetId, accessStatus, status, detectScreens, openTable } = useScreenTargets();
  const resolutionPreset = customResolution ? "custom" : resolutionPresetId(snapshot.display.resolutionPx);
  const sizePreset = customSize ? "custom" : tvSizePresetId(snapshot.display.diagonalInches);

  const persist = (key: "table_resolution" | "table_size" | "table_display_target", value: unknown) => {
    setSettingsError(null);
    void repositories.putSetting(key, value).catch((cause: unknown) => {
      setSettingsError(cause instanceof Error ? cause.message : "Unable to save display settings");
    });
  };
  const updateResolution = (resolutionPx: { readonly width: number; readonly height: number }) => {
    session.updateConfiguration({ display: { resolutionPx } });
    persist("table_resolution", resolutionPx);
  };
  const updateDiagonal = (diagonalInches: number) => {
    session.updateConfiguration({ display: { diagonalInches } });
    persist("table_size", diagonalInches);
  };

  useEffect(() => {
    let cancelled = false;
    void repositories.getSetting<string>("table_display_target").then((value) => {
      if (!cancelled && value) setRememberedTargetId(value);
    });
    return () => {
      cancelled = true;
    };
  }, [repositories]);

  useEffect(() => {
    if (accessStatus === "available" && rememberedTargetId && targets.some((target) => target.id === rememberedTargetId)) {
      setTargetId(rememberedTargetId);
    }
  }, [accessStatus, rememberedTargetId, setTargetId, targets]);

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
      {open ? <PopoverUnderlay label="Close table menu" onClick={() => setOpen(false)} className="z-40" /> : null}
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="z-50 max-h-[calc(100svh-4.25rem)] w-[30rem] gap-0 overflow-y-auto rounded-none border border-violet-300/15 bg-[#100d20]/98 p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.7)] ring-0 backdrop-blur-xl max-sm:w-[calc(100vw-1.5rem)]"
      >
        <div className="flex items-start justify-between gap-3 px-1 pb-2.5">
          <div>
              <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Shared display</p>
              <h2 className="mt-0.5 font-heading text-xl text-amber-50">Player table</h2>
          </div>
          <Badge variant="outline" className="h-auto rounded-none border-amber-200/18 bg-amber-100/5 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-amber-100/55 uppercase">
            {accessStatus === "available" ? displayChosen ? "Configure" : "Choose display" : accessStatus === "checking" || accessStatus === "permission-required" ? "Connect" : "Manual"}
          </Badge>
        </div>

        <Separator className="bg-violet-300/10" />
        {accessStatus === "checking" || accessStatus === "permission-required" ? (
          <div className="grid min-h-64 place-items-center px-5 py-8 text-center">
            <div>
              <span className="mx-auto grid size-14 place-items-center border border-blue-300/20 bg-blue-400/8 text-blue-200"><MonitorUp className="size-6" /></span>
              <h3 className="mt-4 font-heading text-xl text-amber-50">Choose where the table opens</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-violet-100/60">Allow Chrome to identify connected displays. Fantassist will place secondary-display output and select its resolution automatically.</p>
              <Button type="button" onClick={() => void detectScreens()} disabled={accessStatus === "checking"} className="mt-5 h-11 rounded-none border border-blue-300/25 bg-blue-500/25 text-sm text-blue-50 hover:bg-blue-400/35">
                <ScanSearch className="size-4" /> {accessStatus === "checking" ? "Checking permission" : "Allow screen access"}
              </Button>
              <p role="status" aria-live="polite" className="mt-2 text-xs text-violet-100/45">{status}</p>
            </div>
          </div>
        ) : accessStatus === "available" && !displayChosen ? (
          <div className="py-3">
            <h3 className="font-heading text-lg text-amber-50">Select a display</h3>
            <p className="mt-1 text-xs leading-5 text-violet-100/55">Secondary displays open in fullscreen mode. The primary display opens in a normal window.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {targets.map((target) => (
                <DisplayCard key={target.id} target={target} selected={target.id === targetId} remembered={target.id === rememberedTargetId} onClick={() => {
                  setTargetId(target.id);
                  setRememberedTargetId(target.id);
                  persist("table_display_target", target.id);
                  if (target.resolutionWidth && target.resolutionHeight) {
                    setCustomResolution(false);
                    updateResolution({ width: target.resolutionWidth, height: target.resolutionHeight });
                  }
                  setDisplayChosen(true);
                }} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {accessStatus === "available" ? (
              <div className="py-3">
                <button type="button" onClick={() => setDisplayChosen(false)} className="inline-flex items-center gap-1 font-mono text-[10px] text-violet-100/50 uppercase hover:text-violet-50"><ArrowLeft className="size-3" /> Change display</button>
                <div className="mt-2 border border-blue-300/18 bg-blue-400/8 px-3 py-2">
                  <p className="font-heading text-base text-amber-50">{targets.find((target) => target.id === targetId)?.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-blue-100/55 uppercase">Resolution detected · {snapshot.display.resolutionPx.width} × {snapshot.display.resolutionPx.height}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-violet-300/10 px-1 py-3">
                  <h3 className="font-heading text-lg text-amber-50">Configure a window manually</h3>
                  <p className="mt-1 text-xs leading-5 text-violet-100/55">{status} Choose the display resolution and physical TV size, then move the window where you need it.</p>
                </div>
                <DisplayOptionSection label="Resolution">
                  <div className="grid grid-cols-3 gap-1.5">
                    {RESOLUTION_PRESETS.map((preset) => (
                      <PresetButton key={preset.id} selected={resolutionPreset === preset.id} label={preset.label} detail={preset.detail} onClick={() => {
                        setCustomResolution(false);
                        updateResolution({ width: preset.width, height: preset.height });
                      }} />
                    ))}
                    <PresetButton selected={resolutionPreset === "custom"} label="Custom" detail="Pixel size" onClick={() => setCustomResolution(true)} />
                  </div>
                  {resolutionPreset === "custom" ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <NumberSettingField label="Width" suffix="px" value={snapshot.display.resolutionPx.width} min={320} max={8192} step={1} onChange={(width) => updateResolution({ ...snapshot.display.resolutionPx, width })} />
                      <NumberSettingField label="Height" suffix="px" value={snapshot.display.resolutionPx.height} min={240} max={8192} step={1} onChange={(height) => updateResolution({ ...snapshot.display.resolutionPx, height })} />
                    </div>
                  ) : null}
                </DisplayOptionSection>
                <Separator className="bg-violet-300/10" />
              </>
            )}

            <DisplayOptionSection label="TV size">
              <div className="grid grid-cols-4 gap-1.5">
                {TV_SIZE_PRESETS.map((size) => (
                  <PresetButton key={size} selected={sizePreset === String(size)} label={`${size} in`} onClick={() => {
                    setCustomSize(false);
                    updateDiagonal(size);
                  }} />
                ))}
                <PresetButton selected={sizePreset === "custom"} label="Custom" onClick={() => setCustomSize(true)} />
              </div>
              {sizePreset === "custom" ? <div className="mt-2"><NumberSettingField label="Diagonal" suffix="in" value={snapshot.display.diagonalInches} min={10} max={120} step={0.1} onChange={updateDiagonal} /></div> : null}
            </DisplayOptionSection>

            <Separator className="bg-violet-300/10" />
            <div className="grid grid-cols-[1fr_1fr_7.5rem] gap-2 py-2.5">
              <Metric label="Physical" value={`${physical.widthInches.toFixed(1)}×${physical.heightInches.toFixed(1)} in`} />
              <Metric label="Density" value={`${physical.ppi.toFixed(1)} ppi`} />
              <NumberSettingField label="Grid scale" suffix="in" value={table.scale} min={0.1} max={10} step={0.1} onChange={(scale) => engine.dispatch({ type: "table.camera", table: { ...table, scale } })} />
            </div>
            <Button type="button" onClick={() => {
              const launchTargetId = accessStatus === "available" ? targetId : "default";
              persist("table_display_target", launchTargetId);
              openTable(launchTargetId);
            }} className="mt-1 h-11 w-full rounded-none border border-blue-300/25 bg-gradient-to-r from-blue-500/25 via-violet-500/25 to-fuchsia-500/20 text-sm text-amber-50 hover:border-blue-300/45 hover:from-blue-500/35 hover:to-fuchsia-500/30">
              <Radio className="size-3.5 text-fuchsia-300" /> {accessStatus === "available" ? "Launch player table" : "Open in a new window"} <ExternalLink className="size-3 opacity-50" />
            </Button>
          </>
        )}
        {settingsError ? <p role="alert" className="mt-2 text-[10px] text-red-300">{settingsError}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

function DisplayOptionSection({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return (
    <section className="py-2.5">
      <h3 className="mb-2 font-mono text-[10px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">{label}</h3>
      {children}
    </section>
  );
}

function PresetButton({ detail, label, onClick, selected }: {
  readonly detail?: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly selected: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={selected}
      onClick={onClick}
      className="h-12 min-w-0 flex-col gap-0 rounded-none border-violet-300/12 bg-black/15 px-2 text-xs text-violet-100/65 hover:border-blue-300/25 hover:bg-blue-400/8 aria-pressed:border-blue-300/35 aria-pressed:bg-blue-400/15 aria-pressed:text-blue-50"
    >
      <span>{label}</span>
      {detail ? <span className="font-mono text-[9px] text-violet-100/40">{detail}</span> : null}
    </Button>
  );
}

function DisplayCard({ onClick, remembered, selected, target }: {
  readonly onClick: () => void;
  readonly remembered: boolean;
  readonly selected: boolean;
  readonly target: ScreenTarget;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative min-h-28 border p-3.5 text-left transition ${selected ? "border-blue-300/35 bg-blue-400/12" : "border-violet-300/12 bg-black/20 hover:border-blue-300/30 hover:bg-blue-400/8"}`}
    >
      <span className="flex items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center border border-blue-300/18 bg-blue-400/8 text-blue-200"><MonitorUp className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-heading text-base text-amber-50">{target.label}</span>
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span className="font-mono text-[9px] tracking-wide text-violet-100/45 uppercase">{target.isPrimary ? "Primary" : "Secondary"}</span>
            {remembered ? <span className="border border-amber-200/20 bg-amber-100/8 px-1.5 py-0.5 font-mono text-[8px] tracking-wide text-amber-100/75 uppercase">* Last Used</span> : null}
          </span>
          <span className="mt-1.5 block font-mono text-[10px] leading-5 text-violet-100/50 uppercase">{target.resolutionWidth && target.resolutionHeight ? `${target.resolutionWidth} × ${target.resolutionHeight}` : "Resolution detected on launch"}</span>
          <span className="block text-xs leading-5 text-violet-100/50">{target.isInternal === undefined ? "Connected display" : target.isInternal ? "Built-in display" : "External display"}{target.orientationType ? ` · ${friendlyOrientation(target.orientationType)}` : ""}</span>
          <span className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] tracking-wide text-blue-200/65 uppercase group-hover:text-blue-100">Use this display <ArrowRight className="size-3" /></span>
        </span>
        {selected ? <Check className="absolute top-2 right-2 size-3 text-blue-200" /> : null}
      </span>
    </button>
  );
}

function friendlyOrientation(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
