"use client";

import { useState } from "react";
import { CloudRain, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EffectTool } from "@/features/editor/editor-tool";

const EFFECT_OPTIONS = [
  { effect: "rain", label: "Rain", Icon: CloudRain },
] as const satisfies ReadonlyArray<{
  readonly effect: EffectTool;
  readonly label: string;
  readonly Icon: typeof CloudRain;
}>;

export function EffectPicker({ active, effect, label = "Effects", onSelect }: {
  readonly active: boolean;
  readonly effect: EffectTool;
  readonly label?: string;
  readonly onSelect: (effect: EffectTool) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Toggle
              aria-label={label}
              pressed={active}
              style={{ borderRadius: 0 }}
              className="size-9 rounded-none border border-transparent text-violet-100/60 hover:border-violet-300/20 hover:bg-violet-400/12 hover:text-white data-[state=on]:border-sky-200/80 data-[state=on]:bg-blue-500/45 data-[state=on]:text-white data-[state=on]:shadow-[inset_3px_0_0_#7dd3fc,0_0_14px_rgba(59,130,246,0.42)] data-[state=on]:[&_svg]:stroke-white data-[state=on]:[&_svg]:stroke-[2.5] data-[state=on]:[&_svg]:drop-shadow-[0_0_4px_rgba(186,230,253,0.7)]"
            >
              <WandSparkles aria-hidden="true" />
            </Toggle>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" className="rounded-none">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        collisionPadding={12}
        className="w-48 rounded-none border-violet-300/20 bg-[#100d20] p-1.5 text-violet-50"
      >
        <p className="px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-violet-100/45 uppercase">Choose effect</p>
        {EFFECT_OPTIONS.map((option) => (
          <Button
            key={option.effect}
            type="button"
            variant="ghost"
            aria-pressed={active && effect === option.effect}
            onClick={() => {
              onSelect(option.effect);
              setOpen(false);
            }}
            className="w-full justify-start rounded-none text-xs text-violet-100/75 aria-pressed:bg-blue-500/25 aria-pressed:text-white"
          >
            <option.Icon aria-hidden="true" /> {option.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
