"use client";

import { BrickWall, Check, CloudFog, Eraser, Grid3X3, Lightbulb, LocateFixed, Minus, Monitor, MousePointer2, Plus, Redo2, RotateCcw, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import type { TableSession, TableSessionSnapshot } from "@/engine/table-session";
import { getTableBounds, zoomTableCameraAt } from "@/engine/table-camera";
import type { EditorTool } from "@/features/editor/editor-tool";

export function EditorToolbar({
  engine,
  sceneSnapshot,
  session,
  tableSnapshot,
  tool,
  onToolChange,
}: {
  readonly engine: SceneEngine;
  readonly sceneSnapshot: SceneEngineSnapshot;
  readonly session: TableSession;
  readonly tableSnapshot: TableSessionSnapshot;
  readonly tool: EditorTool;
  readonly onToolChange: (tool: EditorTool) => void;
}) {
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
      <ButtonGroup className="sm:flex-col">
        <ToolToggle label="Edit assets" pressed={tool === "assets"} onPressedChange={() => onToolChange("assets")}><MousePointer2 /></ToolToggle>
        <ToolToggle label="Draw fog" pressed={tool === "fog"} onPressedChange={() => onToolChange("fog")}><CloudFog /></ToolToggle>
        <ToolToggle label="Clear fog" pressed={tool === "fog-clear"} onPressedChange={() => onToolChange("fog-clear")}><Eraser /></ToolToggle>
        <ToolToggle label="Draw wall" pressed={tool === "wall"} onPressedChange={() => onToolChange("wall")}><BrickWall /></ToolToggle>
        <ToolToggle label="Place light" pressed={tool === "light"} onPressedChange={() => onToolChange("light")}><Lightbulb /></ToolToggle>
        <ToolToggle label="Edit display view" pressed={tool === "table"} onPressedChange={() => onToolChange("table")}><Monitor /></ToolToggle>
      </ButtonGroup>
      {sceneSnapshot.fogDrawingActive ? (
        <>
          <ToolbarSeparator />
          <ButtonGroup className="sm:flex-col [&_[data-slot=tooltip-trigger]]:rounded-none!">
            <ToolButton label={tool === "wall" ? "Finish wall" : "Finish fog polygon"} onClick={() => engine.commitActiveFogPolygon()}><Check /></ToolButton>
            <ToolButton label={tool === "wall" ? "Cancel wall" : "Cancel fog polygon"} onClick={() => engine.cancelActivePreview()}><X /></ToolButton>
          </ButtonGroup>
        </>
      ) : null}
      <ToolbarSeparator />
      <ButtonGroup className="sm:flex-col [&_[data-slot=tooltip-trigger]]:rounded-none!">
        <ToolButton label="Undo" shortcut="⌘Z" disabled={!sceneSnapshot.canUndo} onClick={() => engine.undo()}><Undo2 /></ToolButton>
        <ToolButton label="Redo" shortcut="⇧⌘Z" disabled={!sceneSnapshot.canRedo} onClick={() => engine.redo()}><Redo2 /></ToolButton>
      </ButtonGroup>
      <ToolbarSeparator />
      <ButtonGroup className="sm:flex-col [&_[data-slot=tooltip-trigger]]:rounded-none!">
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
      <ButtonGroup className="sm:flex-col [&_[data-slot=tooltip-trigger]]:rounded-none!">
        <ToolButton label={tool === "table" ? "Zoom display view in" : "Zoom in"} onClick={() => zoomAtCenter(1.15)}><Plus /></ToolButton>
        <ToolButton label={tool === "table" ? "Zoom display view out" : "Zoom out"} onClick={() => zoomAtCenter(1 / 1.15)}><Minus /></ToolButton>
      </ButtonGroup>
    </aside>
  );
}

function ToolToggle({ children, label, pressed, onPressedChange }: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly pressed: boolean;
  readonly onPressedChange: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          aria-label={label}
          pressed={pressed}
          onPressedChange={onPressedChange}
          style={{ borderRadius: 0 }}
          className="size-9 rounded-none border border-transparent text-violet-100/60 hover:border-violet-300/15 hover:bg-violet-400/10 hover:text-white data-[state=on]:border-blue-300/30 data-[state=on]:bg-blue-500/18 data-[state=on]:text-blue-100"
        >
          {children}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="right" className="rounded-none">{label}</TooltipContent>
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
