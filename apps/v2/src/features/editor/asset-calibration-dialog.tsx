"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AssetCalibration, ImageAsset } from "@/engine/scene-document";
import type { SceneEngine } from "@/engine/scene-engine";
import { useEditorScene } from "@/features/scenes/editor-scene-context";

const GRID_CELL_PX = 48;
const MIN_SLIDER_PPI = 10;
const MAX_SLIDER_PPI = 100;

interface CalibrationDraft {
  readonly ppiX: string;
  readonly ppiY: string;
  readonly xOffset: string;
  readonly yOffset: string;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly calibration: AssetCalibration;
}

export function AssetCalibrationDialog({ asset, engine }: { readonly asset: ImageAsset; readonly engine: SceneEngine }) {
  const editorScene = useEditorScene();
  const getAssetFile = editorScene?.getAssetFile;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(initialCalibration(asset)));
  const [ppiLocked, setPpiLocked] = useState(asset.calibration ? asset.calibration.ppiX === asset.calibration.ppiY : true);
  const [error, setError] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let objectUrl: string | undefined;
    void getAssetFile?.(asset.mediaId).then((file) => {
      if (!active || !file) return;
      objectUrl = URL.createObjectURL(file);
      setAssetUrl(objectUrl);
    });
    return () => {
      active = false;
      setAssetUrl(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.mediaId, getAssetFile, open]);

  const calibration = parseDraft(draft);
  const updateDraft = (key: keyof CalibrationDraft, value: string) => {
    setDraft((current) => key === "ppiX" && ppiLocked
      ? { ...current, ppiX: value, ppiY: value }
      : { ...current, [key]: value });
    setError(null);
  };
  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!calibration) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      calibration,
    };
  };
  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const current = drag.current;
    const image = imageRef.current;
    if (!current || current.pointerId !== event.pointerId || !image) return;
    const bounds = image.getBoundingClientRect();
    const deltaX = (event.clientX - current.startX) * asset.intrinsicSize.width / Math.max(bounds.width, 1);
    const deltaY = (event.clientY - current.startY) * asset.intrinsicSize.height / Math.max(bounds.height, 1);
    const next = {
      ...current.calibration,
      xOffset: roundHundredth(current.calibration.xOffset - deltaX),
      yOffset: roundHundredth(current.calibration.yOffset - deltaY),
    };
    setDraft(toDraft(next));
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) {
        const initial = initialCalibration(asset);
        setDraft(toDraft(initial));
        setPpiLocked(asset.calibration ? initial.ppiX === initial.ppiY : true);
        setError(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-8 rounded-none border-violet-300/18 bg-violet-400/5 text-[10px] text-violet-100/75 hover:border-blue-300/30 hover:bg-blue-400/10 hover:text-white">Calibrate</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-none border border-violet-300/20 bg-[#0b0a18] p-0 text-violet-50 ring-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-violet-300/12 bg-[#111126] px-5 py-4">
          <DialogTitle className="font-serif text-lg">Asset calibration</DialogTitle>
          <DialogDescription className="max-w-2xl text-xs leading-5 text-violet-100/55">
            Drag the map beneath the fixed grid, then zoom each axis until the printed squares align. Locked axes scale together.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 px-5 md:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="relative min-h-80 overflow-hidden border border-violet-300/12 bg-[#070914] md:min-h-[32rem]">
            {assetUrl ? (
              calibration ? (
                /* Object URLs for local source files cannot use the Next image optimizer. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={imageRef}
                  src={assetUrl}
                  alt="Map being calibrated"
                  className="absolute max-w-none cursor-grab touch-none select-none active:cursor-grabbing"
                  style={{
                    left: `${-calibration.xOffset * GRID_CELL_PX / calibration.ppiX}px`,
                    top: `${-calibration.yOffset * GRID_CELL_PX / calibration.ppiY}px`,
                    width: `${asset.intrinsicSize.width * GRID_CELL_PX / calibration.ppiX}px`,
                    height: `${asset.intrinsicSize.height * GRID_CELL_PX / calibration.ppiY}px`,
                  }}
                  draggable={false}
                  onPointerDown={beginDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={() => { drag.current = null; }}
                  onPointerCancel={() => { drag.current = null; }}
                />
              ) : null
            ) : (
              <p className="absolute inset-0 grid place-items-center px-8 text-center text-[11px] leading-5 text-violet-100/50">The source image is unavailable in this browser. Numeric calibration is still available.</p>
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                backgroundImage: "linear-gradient(to right, white 0, white 1px, transparent 1px), linear-gradient(to bottom, white 0, white 1px, transparent 1px)",
                backgroundPosition: "top left",
                backgroundSize: `${GRID_CELL_PX}px ${GRID_CELL_PX}px`,
                mixBlendMode: "difference",
              }}
            />
            <p className="pointer-events-none absolute bottom-2 left-2 bg-black/70 px-2 py-1 font-mono text-[8px] tracking-[0.12em] text-sky-100/70 uppercase">Drag map to align</p>
          </div>
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="font-mono text-[9px] tracking-[0.14em] text-violet-100/55 uppercase">Map zoom</legend>
              <ZoomField label="Horizontal zoom" ppi={calibration?.ppiX} onChange={(ppi) => updateDraft("ppiX", String(ppi))} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={ppiLocked}
                onClick={() => {
                  setPpiLocked((locked) => !locked);
                  if (!ppiLocked) setDraft((current) => ({ ...current, ppiY: current.ppiX }));
                }}
                className="h-7 w-full justify-start rounded-none border border-violet-300/10 px-2 text-[9px] text-violet-100/55"
              >
                {ppiLocked ? <Lock /> : <LockOpen />} {ppiLocked ? "Horizontal and vertical locked" : "Horizontal and vertical independent"}
              </Button>
              <ZoomField label="Vertical zoom" ppi={calibration?.ppiY} disabled={ppiLocked} onChange={(ppi) => updateDraft("ppiY", String(ppi))} />
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="font-mono text-[9px] tracking-[0.14em] text-violet-100/55 uppercase">Pixels per inch</legend>
              <NumberField label="Horizontal PPI" value={draft.ppiX} min="0.01" onChange={(value) => updateDraft("ppiX", value)} />
              <NumberField label="Vertical PPI" value={draft.ppiY} min="0.01" disabled={ppiLocked} onChange={(value) => updateDraft("ppiY", value)} />
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="font-mono text-[9px] tracking-[0.14em] text-violet-100/55 uppercase">Grid origin in source pixels</legend>
              <NumberField label="Horizontal offset" value={draft.xOffset} onChange={(value) => updateDraft("xOffset", value)} />
              <NumberField label="Vertical offset" value={draft.yOffset} onChange={(value) => updateDraft("yOffset", value)} />
            </fieldset>
            {calibration ? (
              <div className="border border-violet-300/10 bg-violet-400/5 p-2 font-mono text-[9px] leading-5 text-violet-100/55">
                Calibrated size<br />
                {(asset.intrinsicSize.width / calibration.ppiX).toFixed(2)} × {(asset.intrinsicSize.height / calibration.ppiY).toFixed(2)} grid units
              </div>
            ) : null}
            {error ? <p role="alert" className="text-[10px] leading-4 text-red-300">{error}</p> : null}
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-none border-violet-300/12 bg-[#111126] px-5 py-3">
          {asset.calibration ? (
            <Button type="button" variant="ghost" className="mr-auto rounded-none text-[10px] text-violet-100/55" onClick={() => {
              const result = engine.dispatch({ type: "asset.calibration", assetId: asset.id, calibration: null });
              if (result.ok) setOpen(false);
              else setError(result.error);
            }}>Remove calibration</Button>
          ) : null}
          <DialogClose asChild><Button type="button" variant="outline" className="rounded-none border-violet-300/15 bg-transparent text-[10px]">Cancel</Button></DialogClose>
          <Button type="button" className="rounded-none bg-sky-300 text-[10px] text-slate-950 hover:bg-sky-200" onClick={() => {
            if (!calibration) {
              setError("Enter positive horizontal and vertical PPI and finite offsets.");
              return;
            }
            const result = engine.dispatch({ type: "asset.calibration", assetId: asset.id, calibration });
            if (result.ok) setOpen(false);
            else setError(result.error);
          }}>Apply calibration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({ disabled, label, min, onChange, value }: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly min?: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="grid gap-1 font-mono text-[9px] tracking-[0.08em] text-violet-100/50 uppercase">
      {label}
      <Input type="number" step="0.01" min={min} disabled={disabled} value={value} onChange={(event) => onChange(event.currentTarget.value)} className="h-8 rounded-none border-violet-300/15 bg-black/20 font-sans text-xs text-violet-50" />
    </label>
  );
}

function ZoomField({ disabled, label, onChange, ppi }: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange: (ppi: number) => void;
  readonly ppi: number | undefined;
}) {
  const boundedPpi = ppi ? Math.min(MAX_SLIDER_PPI, Math.max(MIN_SLIDER_PPI, ppi)) : MAX_SLIDER_PPI;
  const sliderValue = MIN_SLIDER_PPI + MAX_SLIDER_PPI - boundedPpi;
  return (
    <label className="grid gap-1 font-mono text-[9px] tracking-[0.08em] text-violet-100/50 uppercase">
      <span className="flex items-center justify-between gap-2"><span>{label}</span><span className="text-sky-200/70">{ppi?.toFixed(2) ?? "--"} PPI</span></span>
      <input
        type="range"
        min={MIN_SLIDER_PPI}
        max={MAX_SLIDER_PPI}
        step="0.1"
        disabled={disabled || !ppi}
        value={sliderValue}
        onChange={(event) => onChange(roundHundredth(MIN_SLIDER_PPI + MAX_SLIDER_PPI - Number(event.currentTarget.value)))}
        className="h-5 w-full cursor-ew-resize accent-sky-300 disabled:cursor-not-allowed disabled:opacity-35"
      />
      <span className="flex justify-between text-[8px] tracking-normal text-violet-100/30 normal-case"><span>Zoom out · 100 PPI</span><span>10 PPI · Zoom in</span></span>
    </label>
  );
}

function initialCalibration(asset: ImageAsset): AssetCalibration {
  if (asset.calibration) return asset.calibration;
  const ppi = asset.intrinsicSize.width / asset.transform.width;
  return {
    ppiX: ppi,
    ppiY: ppi,
    xOffset: 0,
    yOffset: 0,
  };
}

function toDraft(calibration: AssetCalibration): CalibrationDraft {
  return {
    ppiX: String(roundHundredth(calibration.ppiX)),
    ppiY: String(roundHundredth(calibration.ppiY)),
    xOffset: String(roundHundredth(calibration.xOffset)),
    yOffset: String(roundHundredth(calibration.yOffset)),
  };
}

function parseDraft(draft: CalibrationDraft): AssetCalibration | null {
  const calibration = {
    ppiX: Number(draft.ppiX),
    ppiY: Number(draft.ppiY),
    xOffset: Number(draft.xOffset),
    yOffset: Number(draft.yOffset),
  };
  return Object.values(calibration).every(Number.isFinite) && calibration.ppiX > 0 && calibration.ppiY > 0
    ? calibration
    : null;
}

const roundHundredth = (value: number) => Math.round(value * 100) / 100;
