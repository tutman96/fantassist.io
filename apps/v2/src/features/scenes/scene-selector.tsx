"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Check, ChevronDown, FilePlus2, Radio, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverUnderlay } from "@/components/popover-underlay";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SceneCardThumbnail } from "@/features/campaigns/scene-card-thumbnail";
import { useEditorScene } from "@/features/scenes/editor-scene-context";

export function SceneSelector() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [hasMoreScenes, setHasMoreScenes] = useState(false);
  const [sceneList, setSceneList] = useState<HTMLDivElement | null>(null);
  const editorScene = useEditorScene();
  const scenes = (editorScene?.scenes ?? []).filter((scene) => scene.campaignId === editorScene?.activeCampaignId);
  const activeScene = scenes.find((scene) => scene.key === editorScene?.activeSceneKey) ?? scenes[0];
  const campaign = editorScene?.campaigns.find((item) => item.id === editorScene.activeCampaignId);

  useEffect(() => {
    if (!open || !sceneList) return;
    const update = () => setHasMoreScenes(sceneList.scrollTop + sceneList.clientHeight < sceneList.scrollHeight - 2);
    const resizeObserver = new ResizeObserver(update);
    const mutationObserver = new MutationObserver(update);
    resizeObserver.observe(sceneList);
    mutationObserver.observe(sceneList, { attributes: true, childList: true, subtree: true });
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      update();
      nextFrame = requestAnimationFrame(update);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (nextFrame) cancelAnimationFrame(nextFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [open, query, sceneList, scenes.length]);

  const startCreation = () => {
    setCreateName(`Scene ${scenes.length + 1}`);
    setCreateError(null);
    setOpen(false);
    setCreateOpen(true);
  };

  const submitCreation = async (event: FormEvent) => {
    event.preventDefault();
    if (!editorScene || !createName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const key = await editorScene.createScene(createName);
      setCreateOpen(false);
      router.push(sceneHref(key));
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Unable to create this scene");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
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
          className="z-40 max-h-[calc(var(--radix-popover-content-available-height)-0.5rem)] w-80 gap-0 overflow-y-auto overscroll-contain rounded-none border border-violet-300/15 bg-[#100d20]/98 p-2 text-white shadow-[0_24px_70px_rgba(0,0,0,0.65)] ring-0 backdrop-blur-xl max-sm:w-[calc(100vw-1.5rem)]"
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
            <div className="relative mt-1">
              <CommandList ref={setSceneList} onScroll={(event) => {
                const element = event.currentTarget;
                setHasMoreScenes(element.scrollTop + element.clientHeight < element.scrollHeight - 2);
              }} className="max-h-[min(23.5rem,calc(var(--radix-popover-content-available-height)-6rem))] overscroll-contain [scrollbar-color:transparent_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:block! [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent hover:[scrollbar-color:rgba(167,139,250,0.4)_transparent] hover:[&::-webkit-scrollbar-thumb]:bg-violet-300/40">
                <CommandEmpty className="border border-dashed border-violet-300/15 px-3 py-4 text-[10px] text-violet-100/55" aria-live="polite">
                  No matching scene
                </CommandEmpty>
                {scenes.map((scene) => (
                  <CommandItem
                    key={scene.key}
                    value={`${scene.name} ${scene.key}`}
                    onSelect={() => {
                      router.push(sceneHref(scene.key));
                      setOpen(false);
                    }}
                    className="group rounded-none! border border-transparent px-2 py-2 data-selected:border-blue-300/20 data-selected:bg-blue-500/15"
                  >
                    <span className="relative h-10 w-16 shrink-0 overflow-hidden border border-blue-300/20 bg-[#101329]">
                      <SceneCardThumbnail sceneKey={scene.key} version={scene.version} zoomOnHover={false} />
                      {scene.key === editorScene?.activeSceneKey ? (
                        <span className="absolute right-1 top-1 grid size-4 place-items-center border border-blue-200/30 bg-[#090817]/85 text-blue-100 shadow-sm backdrop-blur-sm">
                          <Check className="size-2.5" aria-hidden="true" />
                        </span>
                      ) : null}
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
              {hasMoreScenes ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-11 items-end justify-center bg-gradient-to-t from-[#100d20] via-[#100d20]/80 to-transparent pb-1" aria-hidden="true">
                  <span className="grid size-5 place-items-center border border-violet-200/15 bg-[#0c0d22]/90 text-violet-100/60 shadow-[0_0_16px_rgba(139,92,246,0.18)]">
                    <ChevronDown className="size-3 animate-bounce" />
                  </span>
                </div>
              ) : null}
            </div>
          </Command>
          {editorScene?.error ? <p role="alert" className="px-2 pt-2 text-[10px] text-red-300 [overflow-wrap:anywhere]">{editorScene.error}</p> : null}
          <Separator className="mt-2 bg-violet-300/10" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-8 rounded-none border-blue-300/20 bg-blue-500/10 text-[10px] text-blue-100 hover:bg-blue-500/20" onClick={startCreation} disabled={!campaign}>
              <FilePlus2 className="size-3" aria-hidden="true" /> New scene
            </Button>
            <Button asChild variant="outline" className="h-8 rounded-none border-violet-300/12 bg-transparent text-[10px] text-violet-100/65">
              <Link href={campaign ? `/campaigns/${encodeURIComponent(campaign.id)}` : "/campaigns"}><Settings2 className="size-3" aria-hidden="true" /> Manage scenes</Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={(nextOpen) => { if (!creating) setCreateOpen(nextOpen); }}>
        <DialogContent className="rounded-none border border-violet-200/15 bg-[#0c0b1d]/98 text-white shadow-[0_30px_100px_rgba(0,0,0,0.7)] sm:max-w-md" showCloseButton={!creating}>
          <form onSubmit={(event) => void submitCreation(event)}>
            <DialogHeader>
              <p className="font-mono text-[8px] tracking-[0.24em] text-blue-200/60 uppercase">Open a new scene</p>
              <DialogTitle className="font-heading text-3xl text-amber-50">Name your scene</DialogTitle>
              <DialogDescription className="text-violet-100/50">A blank scene begins with ready-to-use Assets and Fog layers.</DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-2">
              <Label htmlFor="selector-scene-name" className="font-mono text-[9px] tracking-[0.16em] text-violet-200/55 uppercase">Scene name</Label>
              <Input id="selector-scene-name" autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} maxLength={120} className="h-11 rounded-none border-violet-200/15 bg-black/20 font-heading text-lg text-amber-50 selection:bg-blue-400/30" />
            </div>
            {createError ? <p role="alert" className="mt-3 text-xs text-red-300">{createError}</p> : null}
            <DialogFooter className="mt-6 -mx-4 -mb-4 rounded-none border-violet-200/10 bg-violet-200/4">
              <Button type="button" variant="ghost" className="rounded-none" disabled={creating} onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-none bg-blue-500/75 text-blue-50" disabled={creating || !createName.trim()}>{creating ? "Creating..." : "Create scene"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function sceneHref(key: string): string {
  const [campaignId, sceneId] = key.split("/", 2);
  return `/campaigns/${encodeURIComponent(campaignId)}/scenes/${encodeURIComponent(sceneId)}`;
}
