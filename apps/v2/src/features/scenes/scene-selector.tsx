"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronDown, Radio, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PopoverUnderlay } from "@/components/popover-underlay";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useEditorScene } from "@/features/scenes/editor-scene-context";

export function SceneSelector() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const editorScene = useEditorScene();
  const scenes = (editorScene?.scenes ?? []).filter((scene) => scene.campaignId === editorScene?.activeCampaignId);
  const activeScene = scenes.find((scene) => scene.key === editorScene?.activeSceneKey) ?? scenes[0];
  const campaign = editorScene?.campaigns.find((item) => item.id === activeScene?.campaignId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-8 min-w-0 max-w-[min(45vw,24rem)] gap-1.5 rounded-none px-1 hover:bg-transparent" title={activeScene?.name}>
          <span className="min-w-0 truncate font-heading text-[15px] font-medium tracking-wide text-amber-50/90">
            {activeScene?.name ?? "Loading scenes"}
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
        className="z-40 max-h-[calc(var(--radix-popover-content-available-height)-0.5rem)] w-72 gap-0 overflow-y-auto overscroll-contain rounded-none border border-violet-300/15 bg-[#100d20]/98 p-2 text-white shadow-[0_24px_70px_rgba(0,0,0,0.65)] ring-0 backdrop-blur-xl max-sm:w-[calc(100vw-1.5rem)]"
      >
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
          <CommandList className="mt-1 max-h-[min(22rem,calc(var(--radix-popover-content-available-height)-6rem))] overscroll-contain">
            <CommandEmpty className="border border-dashed border-violet-300/15 px-3 py-4 text-[10px] text-violet-100/55" aria-live="polite">
              No matching scene
            </CommandEmpty>
            {scenes.map((scene) => (
              <CommandItem
                key={scene.key}
                value={`${scene.name} ${scene.key}`}
                onSelect={() => {
                  const [campaignId, sceneId] = scene.key.split("/", 2);
                  router.push(`/campaigns/${encodeURIComponent(campaignId)}/scenes/${encodeURIComponent(sceneId)}`);
                  setOpen(false);
                }}
                className="rounded-none! border border-transparent px-2.5 py-2.5 data-selected:border-blue-300/20 data-selected:bg-blue-500/15"
              >
                <span className="grid size-7 place-items-center border border-blue-300/20 bg-blue-400/10 text-blue-200">
                  {scene.key === editorScene?.activeSceneKey ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-sm text-amber-50" title={scene.name}>{scene.name}</span>
                  <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-wide uppercase">
                    <span className="text-violet-200/55">{scene.prototype ? "Prototype scene" : `Version ${scene.version}`}</span>
                    {scene.key === editorScene?.displayedSceneKey ? <span className="inline-flex items-center gap-1 text-amber-200/75"><Radio className="size-2.5" aria-hidden="true" /> On table</span> : null}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        {editorScene?.error ? <p role="alert" className="px-2 pt-2 text-[10px] text-red-300 [overflow-wrap:anywhere]">{editorScene.error}</p> : null}
        <Separator className="mt-2 bg-violet-300/10" />
        <Button asChild variant="outline" className="mt-2 h-8 w-full rounded-none border-violet-300/12 bg-transparent text-[10px] text-violet-100/65">
          <Link href={campaign ? `/campaigns/${encodeURIComponent(campaign.id)}` : "/campaigns"}><Settings2 className="size-3" aria-hidden="true" /> All campaigns and scenes</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
