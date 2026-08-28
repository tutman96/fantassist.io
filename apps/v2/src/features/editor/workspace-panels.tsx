"use client";

import { useEffect, useState } from "react";
import { Eye, ImageIcon, Layers3, PlusCircle, Ruler } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import type { SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import { EditorPanel, Metric } from "@/features/editor/editor-panel";

export function WorkspacePanels({
  engine,
  sceneSnapshot,
}: {
  readonly engine: SceneEngine;
  readonly sceneSnapshot: SceneEngineSnapshot;
}) {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const asset = sceneSnapshot.scene.assets[0];
  const assetSelected = sceneSnapshot.selectedAssetId === asset.id;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => {
      setInspectorOpen(media.matches);
      setLayersOpen(media.matches);
    };
    queueMicrotask(update);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const revealInspector = () => {
    if (window.matchMedia("(max-width: 639px)").matches) {
      setLayersOpen(false);
      setInspectorOpen(true);
    }
  };

  return (
    <>
      <EditorPanel
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        eyebrow="Inspector"
        title={assetSelected ? asset.name : "Scene details"}
        detail={assetSelected ? `Image · revision ${sceneSnapshot.revision}` : "Astral Clearing · prototype"}
        icon={assetSelected ? <ImageIcon /> : <Ruler />}
        className="top-20 right-3 left-3 max-h-[55%] sm:top-4 sm:right-4 sm:left-auto sm:max-h-[calc(100%-2rem)] sm:w-[19rem]"
        contentClassName="max-h-[calc(55svh-5rem)] sm:max-h-[calc(100svh-12rem)]"
      >
        {assetSelected ? (
          <AssetInspector sceneSnapshot={sceneSnapshot} />
        ) : (
          <SceneInspector />
        )}
      </EditorPanel>

      <EditorPanel
        open={layersOpen}
        onOpenChange={setLayersOpen}
        eyebrow="Layer stack"
        title="Scene layers"
        detail="1 content layer"
        icon={<Layers3 />}
        className="right-3 bottom-3 left-3 max-h-[45%] sm:right-4 sm:bottom-4 sm:left-auto sm:w-[19rem]"
        contentClassName="max-h-[calc(45svh-5rem)]"
      >
        <div className="p-2.5">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Content</p>
            <Button disabled variant="ghost" size="icon-sm" type="button" title="Layer creation is not available yet" aria-label="Add layer" className="rounded-none border border-violet-300/12 text-violet-100/35">
              <PlusCircle className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-pressed={assetSelected}
            onClick={() => {
              engine.dispatch({ type: "selection.set", assetId: asset.id });
              revealInspector();
            }}
            className="group/layer min-h-11 w-full justify-start gap-2.5 rounded-none border border-transparent px-2 py-1.5 text-left hover:border-violet-300/12 hover:bg-violet-400/5 aria-pressed:border-blue-300/20 aria-pressed:bg-gradient-to-r aria-pressed:from-blue-500/14 aria-pressed:to-violet-500/8"
          >
            <span className="grid size-8 shrink-0 place-items-center border border-violet-300/12 bg-black/20 text-violet-200/50 group-aria-pressed/layer:border-blue-300/25 group-aria-pressed/layer:text-blue-200">
              <ImageIcon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-violet-50/90">{asset.name}</span>
              <span className="block truncate font-mono text-[9px] tracking-wide text-violet-100/50 uppercase">Image · inferred layer</span>
            </span>
            <Eye className="size-3.5 text-violet-200/55" aria-label="Visible" />
          </Button>
          <p className="mt-1.5 px-1 text-[10px] leading-4 text-violet-100/50">
            Ordering, visibility controls, and content insertion arrive with the persisted scene model.
          </p>
        </div>
      </EditorPanel>
    </>
  );
}

function AssetInspector({ sceneSnapshot }: { readonly sceneSnapshot: SceneEngineSnapshot }) {
  const asset = sceneSnapshot.scene.assets[0];
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Selected image</p>
          <h3 className="mt-1 font-heading text-base text-amber-50">{asset.name}</h3>
        </div>
        <Badge variant="outline" className="h-auto rounded-none border-blue-300/20 bg-blue-400/5 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-blue-100/65 uppercase">Image</Badge>
      </div>
      <Separator className="my-2.5 bg-violet-300/10" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Metric label="Position" value={`${asset.transform.x.toFixed(2)}, ${asset.transform.y.toFixed(2)}`} />
        <Metric label="Size" value={`${asset.transform.width.toFixed(2)} × ${asset.transform.height.toFixed(2)}`} />
        <Metric label="Rotation" value={`${asset.transform.rotation.toFixed(1)}°`} />
        <Metric label="Revision" value={String(sceneSnapshot.revision)} />
      </div>
      <Separator className="my-2.5 bg-violet-300/10" />
      <div className="space-y-1 text-[10px] leading-5 text-violet-100/60">
        <p><Kbd className="mr-1 h-4 min-w-4 rounded-none bg-blue-400/10 text-[9px] text-blue-200/75">Shift</Kbd> preserves ratio from a corner.</p>
        <p><Kbd className="mr-1 h-4 min-w-4 rounded-none bg-blue-400/10 text-[9px] text-blue-200/75">Alt</Kbd> mirrors resize around the center.</p>
        <p>Rotation captures 45° increments within a 5° window.</p>
      </div>
      <Separator className="my-2.5 bg-violet-300/10" />
      <div className="grid grid-cols-2 gap-1.5">
        <Button disabled variant="outline" className="h-8 rounded-none border-violet-300/12 bg-violet-400/5 text-[10px] text-violet-100/35">Replace media</Button>
        <Button disabled variant="outline" className="h-8 rounded-none border-violet-300/12 bg-violet-400/5 text-[10px] text-violet-100/35">Calibrate</Button>
      </div>
    </div>
  );
}

function SceneInspector() {
  return (
    <div className="p-3">
      <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Current scene</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-base text-amber-50">Astral Clearing</h3>
          <p className="mt-0.5 text-[10px] text-violet-100/55">Prototype scene · not persisted</p>
        </div>
        <Badge variant="outline" className="h-auto rounded-none border-violet-300/15 bg-violet-400/5 px-2 py-1 font-mono text-[9px] text-violet-100/65">1 image</Badge>
      </div>
      <Separator className="my-2.5 bg-violet-300/10" />
      <p className="text-[10px] leading-4 text-violet-100/60">
        Select scene content to inspect its transform. Shared display calibration and screen selection live in the Open Table menu.
      </p>
    </div>
  );
}
