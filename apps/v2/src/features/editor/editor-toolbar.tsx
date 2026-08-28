"use client";

import { Grid3X3, LocateFixed, Minus, Move, Plus, Redo2, RotateCcw, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import type { TableSession, TableSessionSnapshot } from "@/engine/table-session";

export function EditorToolbar({
  engine,
  sceneSnapshot,
  session,
  tableSnapshot,
}: {
  readonly engine: SceneEngine;
  readonly sceneSnapshot: SceneEngineSnapshot;
  readonly session: TableSession;
  readonly tableSnapshot: TableSessionSnapshot;
}) {
  const zoomAtCenter = (factor: number) => session.zoomAt(
    { x: tableSnapshot.viewportCss.width / 2, y: tableSnapshot.viewportCss.height / 2 },
    factor
  );

  return (
    <aside aria-label="Editor tools" className="absolute top-3 left-3 z-10 flex items-center gap-1 border border-violet-300/15 bg-[#100d20]/92 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:top-4 sm:left-4 sm:flex-col">
      <span className="mb-1 hidden size-8 place-items-center border-b border-violet-300/10 text-violet-300/70 sm:grid">
        <Move className="size-3.5" aria-hidden="true" />
      </span>
      <ButtonGroup className="sm:flex-col [&_[data-slot=tooltip-trigger]]:rounded-none!">
        <ToolButton label="Undo" shortcut="⌘Z" disabled={!sceneSnapshot.canUndo} onClick={() => engine.undo()}><Undo2 /></ToolButton>
        <ToolButton label="Redo" shortcut="⇧⌘Z" disabled={!sceneSnapshot.canRedo} onClick={() => engine.redo()}><Redo2 /></ToolButton>
      </ButtonGroup>
      <ToolbarSeparator />
      <ButtonGroup className="sm:flex-col [&_[data-slot=tooltip-trigger]]:rounded-none!">
        <ToolButton label="Fit table" onClick={() => session.fitTable()}><LocateFixed /></ToolButton>
        <ToolButton label="Reset table" onClick={() => session.resetTable()}><RotateCcw /></ToolButton>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              aria-label={`Grid ${tableSnapshot.editorGridVisible ? "on" : "off"}`}
              pressed={tableSnapshot.editorGridVisible}
              onPressedChange={(pressed) => session.setEditorGridVisible(pressed)}
              style={{ borderRadius: 0 }}
              className="size-9 rounded-none border border-transparent text-violet-100/70 hover:border-violet-300/15 hover:bg-violet-400/10 hover:text-white data-[state=on]:border-violet-300/25 data-[state=on]:bg-gradient-to-br data-[state=on]:from-blue-500/25 data-[state=on]:to-fuchsia-500/20 data-[state=on]:text-violet-50"
            >
              <Grid3X3 />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="right" className="rounded-none">Toggle editor grid</TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <ToolbarSeparator />
      <ButtonGroup className="sm:flex-col [&_[data-slot=tooltip-trigger]]:rounded-none!">
        <ToolButton label="Zoom in" onClick={() => zoomAtCenter(1.15)}><Plus /></ToolButton>
        <ToolButton label="Zoom out" onClick={() => zoomAtCenter(1 / 1.15)}><Minus /></ToolButton>
      </ButtonGroup>
    </aside>
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
