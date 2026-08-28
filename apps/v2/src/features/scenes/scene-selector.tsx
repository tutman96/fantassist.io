"use client";

import { useState } from "react";
import { Check, ChevronDown, FilePlus2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PopoverUnderlay } from "@/components/popover-underlay";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

export function SceneSelector() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-8 min-w-0 gap-1.5 rounded-none px-1 hover:bg-transparent">
          <span className="truncate font-heading text-[15px] font-medium tracking-wide text-amber-50/90">
            Astral Clearing
          </span>
          <ChevronDown className={`size-3 shrink-0 text-violet-200/40 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {open && (
        <PopoverUnderlay
          label="Close scene selector"
          onClick={() => setOpen(false)}
        />
      )}
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="z-40 w-72 gap-0 rounded-none border border-violet-300/15 bg-[#100d20]/98 p-2 text-white shadow-[0_24px_70px_rgba(0,0,0,0.65)] ring-0 backdrop-blur-xl max-sm:w-[calc(100vw-1.5rem)]"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <div>
            <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-200/60 uppercase">Prototype campaign</p>
            <p className="mt-0.5 text-[10px] text-amber-50/65">Scenes are not persisted yet</p>
          </div>
          <Badge variant="outline" className="h-auto rounded-none border-amber-200/20 bg-amber-100/5 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-amber-100/60 uppercase">Local</Badge>
        </div>
        <Command
          className="rounded-none! bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group]]:rounded-none!"
          filter={(value, search) => value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search scenes"
            aria-label="Search scenes"
            className="text-[11px] text-violet-50 placeholder:text-violet-100/45"
          />
          <CommandList className="mt-1">
            <CommandEmpty className="border border-dashed border-violet-300/15 px-3 py-4 text-[10px] text-violet-100/55" aria-live="polite">
              No matching prototype scene
            </CommandEmpty>
            <CommandItem value="astral clearing" className="rounded-none! border border-blue-300/20 bg-blue-500/10 px-2.5 py-2.5 data-selected:bg-blue-500/15">
              <span className="grid size-7 place-items-center border border-blue-300/20 bg-blue-400/10 text-blue-200">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-sm text-amber-50">Astral Clearing</span>
                <span className="block font-mono text-[9px] tracking-wide text-violet-200/55 uppercase">Prototype scene</span>
              </span>
            </CommandItem>
          </CommandList>
        </Command>
        <Separator className="mt-2 bg-violet-300/10" />
        <div className="grid grid-cols-2 gap-1 pt-2">
          <Button disabled variant="outline" type="button" title="Scene persistence is not available yet" className="h-8 rounded-none border-violet-300/12 bg-transparent text-[10px] text-violet-100/40">
            <FilePlus2 className="size-3" aria-hidden="true" /> New scene
          </Button>
          <Button disabled variant="outline" type="button" title="Scene import is not available yet" className="h-8 rounded-none border-violet-300/12 bg-transparent text-[10px] text-violet-100/40">
            <Upload className="size-3" aria-hidden="true" /> Import
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
