"use client";

import { useRef, useState } from "react";
import { BrickWall, Check, CloudFog, Eraser, Grid3X3, ImagePlus, Lightbulb, LocateFixed, Minus, Monitor, MousePointer2, Plus, Redo2, RotateCcw, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import type { TableSession, TableSessionSnapshot } from "@/engine/table-session";
import { getTableBounds, zoomTableCameraAt } from "@/engine/table-camera";
import type { EditorTool, EffectTool } from "@/features/editor/editor-tool";
import { ensureAssetLayer } from "@/features/editor/editor-tool";
import { EffectPicker } from "@/features/editor/effect-picker";
import { useEditorScene } from "@/features/scenes/editor-scene-context";

export function EditorToolbar({
  engine,
  effectTool,
  onEffectToolChange,
  sceneSnapshot,
  session,
  tableSnapshot,
  tool,
  onToolChange,
}: {
  readonly engine: SceneEngine;
  readonly effectTool: EffectTool;
  readonly onEffectToolChange: (tool: EffectTool) => void;
  readonly sceneSnapshot: SceneEngineSnapshot;
  readonly session: TableSession;
  readonly tableSnapshot: TableSessionSnapshot;
  readonly tool: EditorTool;
  readonly onToolChange: (tool: EditorTool) => void;
}) {
  const editorScene = useEditorScene();
  const uploadInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const zoomAtCenter = (factor: number) => {
    if (tool !== "table") {
      session.zoomAt(
        { x: tableSnapshot.viewportCss.width / 2, y: tableSnapshot.viewportCss.height / 2 },
        factor
      );
      return;
    }
    const table = sceneSnapshot.scene.table;
    const bounds = getTableBounds(table, tableSnapshot.display);
    engine.dispatch({
      type: "table.camera",
      table: zoomTableCameraAt(
        table,
        tableSnapshot.display,
        { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
        factor
      ),
    });
  };

  return (
    <aside aria-label="Editor tools" className="absolute top-3 left-3 z-10 flex items-center gap-1 border border-violet-300/15 bg-[#100d20]/92 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:top-4 sm:left-4 sm:flex-col">
      <input
        ref={uploadInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Add image assets"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (!editorScene || files.length === 0) return;
          setUploading(true);
          setUploadError(null);
          void (async () => {
            const selectedAsset = sceneSnapshot.selectedAssetId
              ? sceneSnapshot.scene.assets.find((asset) => asset.id === sceneSnapshot.selectedAssetId)
              : undefined;
            const layerId = selectedAsset?.layerId ?? ensureAssetLayer(engine);
            await editorScene.uploadImages(files, {
              centerGrid: tableSnapshot.editorCamera.centerGrid,
              heightGrid: tableSnapshot.viewportCss.height / tableSnapshot.editorCamera.cssPixelsPerGrid / 2,
              layerId,
            });
          })().catch((cause: unknown) => {
            setUploadError(cause instanceof Error ? cause.message : "Unable to upload the image");
          }).finally(() => setUploading(false));
        }}
      />
      <ButtonGroup className="sm:flex-col sm:[&>*:not(:first-child)]:border-l">
        <ToolToggle label="Edit assets" pressed={tool === "assets"} onPressedChange={() => onToolChange("assets")} showTooltip={false}><MousePointer2 /></ToolToggle>
        <ToolButton
          label={uploading ? "Adding assets" : "Add asset"}
          disabled={!editorScene || editorScene.status === "loading" || editorScene.status === "conflict" || uploading}
          onClick={() => {
            setUploadError(null);
            uploadInput.current?.click();
          }}
        >
          <ImagePlus />
        </ToolButton>
        <ToolToggle label="Draw fog" pressed={tool === "fog"} onPressedChange={() => onToolChange("fog")}><CloudFog /></ToolToggle>
        <ToolToggle label="Clear fog" pressed={tool === "fog-clear"} onPressedChange={() => onToolChange("fog-clear")}><Eraser /></ToolToggle>
        <ToolToggle label="Draw wall" pressed={tool === "wall"} onPressedChange={() => onToolChange("wall")}><BrickWall /></ToolToggle>
        <ToolToggle label="Place light" pressed={tool === "light"} onPressedChange={() => onToolChange("light")}><Lightbulb /></ToolToggle>
        <EffectPicker active={tool === "effects"} effect={effectTool} onSelect={onEffectToolChange} />
        <ToolToggle label="Edit display view" pressed={tool === "table"} onPressedChange={() => onToolChange("table")}><Monitor /></ToolToggle>
      </ButtonGroup>
      {sceneSnapshot.fogDrawingActive || sceneSnapshot.effectDrawingActive ? (
        <>
          <ToolbarSeparator />
          <ButtonGroup className="sm:flex-col sm:[&>*:not(:first-child)]:border-l [&_[data-slot=tooltip-trigger]]:rounded-none!">
            <ToolButton label={tool === "effects" ? "Finish effect area" : tool === "wall" ? "Finish wall" : "Finish fog polygon"} onClick={() => tool === "effects" ? engine.commitActiveRainEffect() : engine.commitActiveFogPolygon()}><Check /></ToolButton>
            <ToolButton label={tool === "effects" ? "Cancel effect area" : tool === "wall" ? "Cancel wall" : "Cancel fog polygon"} onClick={() => engine.cancelActivePreview()}><X /></ToolButton>
          </ButtonGroup>
        </>
      ) : null}
      <ToolbarSeparator />
      <ButtonGroup className="sm:flex-col sm:[&>*:not(:first-child)]:border-l [&_[data-slot=tooltip-trigger]]:rounded-none!">
        <ToolButton label="Undo" shortcut="⌘Z" disabled={!sceneSnapshot.canUndo} onClick={() => engine.undo()}><Undo2 /></ToolButton>
        <ToolButton label="Redo" shortcut="⇧⌘Z" disabled={!sceneSnapshot.canRedo} onClick={() => engine.redo()}><Redo2 /></ToolButton>
      </ButtonGroup>
      <ToolbarSeparator />
      <ButtonGroup className="sm:flex-col sm:[&>*:not(:first-child)]:border-l [&_[data-slot=tooltip-trigger]]:rounded-none!">
        <ToolButton label="Fit table" onClick={() => session.fitTable(sceneSnapshot.scene.table)}><LocateFixed /></ToolButton>
        <ToolButton label="Reset table view" onClick={() => engine.dispatch({
          type: "table.camera",
          table: { ...sceneSnapshot.scene.table, originGrid: { x: 0, y: 0 }, scale: 1 },
        })}><RotateCcw /></ToolButton>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              aria-label={`Grid ${sceneSnapshot.scene.table.displayGrid ? "on" : "off"}`}
              pressed={sceneSnapshot.scene.table.displayGrid}
              onPressedChange={(pressed) => {
                engine.dispatch({
                  type: "table.camera",
                  table: { ...sceneSnapshot.scene.table, displayGrid: pressed },
                });
              }}
              style={{ borderRadius: 0 }}
              className="size-9 rounded-none border border-transparent text-violet-100/70 hover:border-violet-300/15 hover:bg-violet-400/10 hover:text-white data-[state=on]:border-violet-300/25 data-[state=on]:bg-gradient-to-br data-[state=on]:from-blue-500/25 data-[state=on]:to-fuchsia-500/20 data-[state=on]:text-violet-50"
            >
              <Grid3X3 />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="right" className="rounded-none">Toggle DM and player grid</TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <ToolbarSeparator />
      <ButtonGroup className="sm:flex-col sm:[&>*:not(:first-child)]:border-l [&_[data-slot=tooltip-trigger]]:rounded-none!">
        <ToolButton label={tool === "table" ? "Zoom display view in" : "Zoom in"} onClick={() => zoomAtCenter(1.15)}><Plus /></ToolButton>
        <ToolButton label={tool === "table" ? "Zoom display view out" : "Zoom out"} onClick={() => zoomAtCenter(1 / 1.15)}><Minus /></ToolButton>
      </ButtonGroup>
      {uploadError ? <p role="alert" className="absolute top-full left-0 mt-2 w-60 border border-red-300/20 bg-[#100d20]/96 px-2.5 py-2 text-[10px] text-red-300 shadow-lg [overflow-wrap:anywhere] sm:top-0 sm:left-full sm:mt-0 sm:ml-2">{uploadError}</p> : null}
    </aside>
  );
}

function ToolToggle({ children, label, pressed, onPressedChange, showTooltip = true }: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly pressed: boolean;
  readonly onPressedChange: () => void;
  readonly showTooltip?: boolean;
}) {
  const toggle = (
    <Toggle
      aria-label={label}
      pressed={pressed}
      onPressedChange={onPressedChange}
      style={{ borderRadius: 0 }}
      className="size-9 rounded-none border border-transparent text-violet-100/60 hover:border-violet-300/20 hover:bg-violet-400/12 hover:text-white data-[state=on]:border-sky-200/80 data-[state=on]:bg-blue-500/45 data-[state=on]:text-white data-[state=on]:shadow-[inset_3px_0_0_#7dd3fc,0_0_14px_rgba(59,130,246,0.42)] data-[state=on]:[&_svg]:stroke-white data-[state=on]:[&_svg]:stroke-[2.5] data-[state=on]:[&_svg]:drop-shadow-[0_0_4px_rgba(186,230,253,0.7)]"
    >
      {children}
    </Toggle>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{toggle}</TooltipTrigger>
      {showTooltip ? <TooltipContent side="right" className="rounded-none">{label}</TooltipContent> : null}
    </Tooltip>
  );
}

function ToolButton({ children, disabled, label, onClick, shortcut }: { readonly children: React.ReactNode; readonly disabled?: boolean; readonly label: string; readonly onClick: () => void; readonly shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          style={{ borderRadius: 0 }}
          className="rounded-none border border-transparent text-violet-100/70 hover:border-violet-300/15 hover:bg-violet-400/10 hover:text-white disabled:text-violet-100/30 [&_svg]:size-4"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="rounded-none">
        {label}{shortcut ? <Kbd className="ml-1">{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function ToolbarSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-6 bg-gradient-to-b from-transparent via-violet-300/30 to-transparent sm:mx-0 sm:my-1 sm:h-px sm:w-6 sm:bg-gradient-to-r" />;
}
