"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, Download, FilePlus2, FolderOpen, GitFork, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";

import appIcon from "@/app/icon-full-dark.png";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditorScene } from "@/features/scenes/editor-scene-context";
import { SceneCardThumbnail } from "./scene-card-thumbnail";

type CreationMode = "campaign" | "scene" | null;
type RenameTarget = { readonly type: "campaign"; readonly id: string; readonly name: string } | { readonly type: "scene"; readonly key: string; readonly name: string };
type DeleteTarget = { readonly type: "campaign"; readonly id: string; readonly name: string } | { readonly type: "scene"; readonly key: string; readonly name: string };

export function CampaignObservatory({ campaignId, initialCreationMode = null, landing = false }: {
  readonly campaignId?: string;
  readonly initialCreationMode?: CreationMode;
  readonly landing?: boolean;
}) {
  const router = useRouter();
  const editorScene = useEditorScene();
  const importInput = useRef<HTMLInputElement>(null);
  const sceneGrid = useRef<HTMLDivElement>(null);
  const [creationMode, setCreationMode] = useState<CreationMode>(initialCreationMode);
  const activeCreationMode = creationMode;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [sceneQuery, setSceneQuery] = useState("");
  const [hasMoreScenes, setHasMoreScenes] = useState(false);
  const campaigns = editorScene?.campaigns ?? [];
  const activeCampaign = campaigns.find((campaign) => campaign.id === (campaignId ?? editorScene?.activeCampaignId)) ?? null;
  const campaignScenes = (editorScene?.scenes ?? []).filter((scene) => scene.campaignId === activeCampaign?.id);
  const visibleScenes = campaignScenes.filter((scene) => scene.name.toLocaleLowerCase().includes(sceneQuery.trim().toLocaleLowerCase()));
  const isEmptyArchive = campaigns.length === 0;
  const inlineOnboarding = isEmptyArchive && initialCreationMode === "campaign";
  const showLandingHero = landing || isEmptyArchive;

  useEffect(() => {
    const element = sceneGrid.current;
    if (!element) return;
    const update = () => setHasMoreScenes(element.scrollTop + element.clientHeight < element.scrollHeight - 2);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    queueMicrotask(update);
    return () => observer.disconnect();
  }, [activeCampaign?.id, visibleScenes.length]);

  const startCreation = (mode: Exclude<CreationMode, null>) => {
    setCreationMode(mode);
    setName(mode === "campaign" ? "Untitled Campaign" : `Scene ${campaignScenes.length + 1}`);
    setLocalError(null);
  };
  const submitCreation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editorScene || !activeCreationMode || !name.trim()) return;
    setBusy(true);
    setLocalError(null);
    try {
      if (activeCreationMode === "campaign") {
        const id = await editorScene.createCampaign(name);
        router.push(`/campaigns/${encodeURIComponent(id)}`);
      } else {
        const key = await editorScene.createScene(name);
        router.push(sceneHref(key));
      }
      setCreationMode(null);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Unable to create this record");
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file: File | undefined) => {
    if (!file || !editorScene) return;
    setBusy(true);
    setLocalError(null);
    try {
      const key = await editorScene.importScene(file);
      router.push(sceneHref(key));
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Unable to import this scene");
    } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = "";
    }
  };
  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setLocalError(null);
    try {
      await action();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Unable to complete this action");
    } finally {
      setBusy(false);
    }
  };
  const beginRename = (target: RenameTarget) => {
    setRenameTarget(target);
    setRenameName(target.name);
    setLocalError(null);
  };
  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editorScene || !renameTarget) return;
    await runAction(async () => {
      if (renameTarget.type === "campaign") await editorScene.renameCampaign(renameTarget.id, renameName);
      else await editorScene.renameScene(renameTarget.key, renameName);
      setRenameTarget(null);
    });
  };
  const confirmDelete = async () => {
    if (!editorScene || !deleteTarget) return;
    const target = deleteTarget;
    await runAction(async () => {
      if (target.type === "campaign") {
        const fallback = await editorScene.deleteCampaign(target.id);
        router.replace(fallback ? `/campaigns/${encodeURIComponent(fallback)}` : "/campaigns");
      } else {
        await editorScene.deleteScene(target.key);
        const campaign = target.key.split("/", 1)[0];
        router.replace(`/campaigns/${encodeURIComponent(campaign)}`);
      }
      setDeleteTarget(null);
    });
  };

  return (
    <main className="relative isolate min-h-svh overflow-x-hidden text-white lg:h-svh lg:overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-[92rem] flex-col px-4 py-4 sm:px-7 sm:py-6 lg:h-full lg:min-h-0 lg:px-10">
        <header className={`flex items-center justify-between pb-4 ${landing ? "" : "border-b border-violet-200/12"}`}>
          <Link href="/" className="group/brand flex shrink-0 items-center gap-2 text-violet-100/75 transition hover:text-white" aria-label="Fantassist home">
            <span className="relative grid size-7 place-items-center">
              <Image src="/fantassist-mark.png" width={28} height={28} priority alt="" className="size-7 object-contain drop-shadow-[0_0_7px_rgba(129,92,246,0.4)] transition-transform duration-300 group-hover/brand:rotate-6 group-hover/brand:scale-105" />
            </span>
            <span className="font-mono text-[9px] font-semibold tracking-[0.22em] uppercase">Fantassist</span>
            {!landing ? <span className="hidden text-[8px] font-normal tracking-[0.16em] text-violet-200/35 uppercase sm:inline">/ Campaign observatory</span> : null}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {editorScene?.activeSceneKey ? (
              <Button asChild variant="ghost" className="rounded-none px-1.5 text-violet-100/70 hover:bg-violet-300/10 sm:px-2.5">
                <Link href={sceneHref(editorScene.activeSceneKey)}><ArrowLeft className="size-3.5" aria-hidden="true" /> Back<span className="hidden sm:inline"> to scene</span></Link>
              </Button>
            ) : null}
            <Button asChild variant={landing ? "ghost" : "outline"} className={`rounded-none text-violet-50 hover:bg-violet-300/10 ${landing ? "text-violet-100/55 hover:text-violet-50" : "border-violet-200/15 bg-black/15"}`}>
              <Link href="/campaigns/new"><Plus aria-hidden="true" /> New<span className="hidden sm:inline"> campaign</span></Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-none px-2 text-violet-200/55 hover:bg-violet-300/10 hover:text-violet-50">
              <a href="https://github.com/tutman96/fantassist.io" target="_blank" rel="noreferrer"><GitFork aria-hidden="true" /><span className="hidden sm:inline">GitHub</span><span className="sr-only"> (opens in a new tab)</span></a>
            </Button>
            <Button asChild variant="ghost" className="hidden rounded-none text-violet-200/55 sm:inline-flex">
              <Link href="/beta">Beta</Link>
            </Button>
          </div>
        </header>

        {showLandingHero ? (
          <section className="grid flex-1 place-items-center py-14" aria-labelledby="empty-campaign-title">
            <div className="relative w-full max-w-3xl text-center">
              <div className="pointer-events-none absolute left-1/2 top-1/2 size-[34rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/8 [box-shadow:0_0_120px_rgba(91,33,182,0.16),inset_0_0_90px_rgba(59,130,246,0.06)]" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 size-[24rem] max-w-[68vw] -translate-x-1/2 -translate-y-1/2 rotate-12 rounded-full border border-dashed border-blue-300/10" />
              {!landing && !inlineOnboarding ? (
                <div className="relative mx-auto mb-5 grid h-40 w-48 place-items-center sm:h-44 sm:w-56">
                  <Image src={appIcon} priority alt="Fantassist" className="relative w-48 max-w-none object-contain drop-shadow-[0_0_18px_rgba(139,92,246,0.62)] sm:w-52" />
                </div>
              ) : null}
              {inlineOnboarding ? (
                <form onSubmit={(event) => void submitCreation(event)} className="relative mx-auto max-w-xl">
                  <p className="mb-3 font-mono text-[9px] tracking-[0.3em] text-blue-200/65 uppercase">Chart your first world</p>
                  <h1 id="empty-campaign-title" className="font-heading text-5xl leading-[0.95] text-amber-50 sm:text-7xl">Give this universe<br />a name.</h1>
                  <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-violet-100/60">This campaign will become the atlas for its scenes, maps, and encounters. You can change its name later.</p>
                  <div className="mx-auto mt-7 grid max-w-md gap-2 text-left">
                    <Label htmlFor="onboarding-campaign-name" className="font-mono text-[9px] tracking-[0.18em] text-violet-100/55 uppercase">Campaign name</Label>
                    <Input id="onboarding-campaign-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="The Shattered Meridian" className="h-12 rounded-none border-blue-200/25 bg-[#070817]/75 px-4 font-heading text-xl text-amber-50 shadow-[0_0_35px_rgba(59,130,246,0.09)] placeholder:text-violet-100/25" />
                  </div>
                  {localError ? <p role="alert" className="mt-3 text-xs text-red-300">{localError}</p> : null}
                  <div className="mt-5 flex items-center justify-center gap-2">
                    <Button asChild variant="ghost" className="rounded-none text-violet-100/60"><Link href="/campaigns"><ArrowLeft aria-hidden="true" /> Back</Link></Button>
                    <Button type="submit" size="lg" disabled={busy || !name.trim()} className="h-11 rounded-none border border-blue-200/20 bg-blue-500/75 px-5 text-blue-50 shadow-[0_0_30px_rgba(59,130,246,0.24)] hover:bg-blue-400/80">
                      {busy ? "Charting..." : "Create campaign"} <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="mb-3 font-mono text-[9px] tracking-[0.3em] text-blue-200/65 uppercase">{isEmptyArchive ? "No worlds charted" : `${campaigns.length} ${campaigns.length === 1 ? "world" : "worlds"} charted`}</p>
                  <h1 id="empty-campaign-title" className="font-heading text-5xl leading-[0.95] text-amber-50 sm:text-7xl">
                    {isEmptyArchive ? <>Your table is waiting<br />for its first universe.</> : <>Your next story is waiting<br />beyond the stars.</>}
                  </h1>
                  <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-violet-100/60 sm:text-base">{isEmptyArchive ? "Campaigns hold your maps, encounters, and every scene your party has yet to discover. Name the first one and we will open the way." : "Your worlds, maps, and encounters are waiting in the campaign observatory. Choose an atlas and continue the story."}</p>
                  <Button asChild size="lg" variant="outline" className="group relative mt-8 h-12 overflow-hidden rounded-none border-amber-100/20 bg-[linear-gradient(110deg,rgba(8,9,27,0.82),rgba(62,41,20,0.34),rgba(8,9,27,0.82))] px-6 text-amber-50 shadow-[0_0_28px_rgba(245,190,70,0.09),inset_0_0_18px_rgba(255,220,130,0.025)] backdrop-blur-sm hover:border-amber-100/35 hover:bg-amber-100/8 hover:text-amber-50">
                    <Link href={isEmptyArchive ? "/campaigns/new" : "/campaigns"}>
                      <span className="size-1.5 rotate-45 bg-amber-200/75 shadow-[0_0_10px_rgba(253,230,138,0.7)]" aria-hidden="true" />
                      {isEmptyArchive ? "Create your first campaign" : "Choose a campaign"}
                      <ArrowRight className="text-amber-100/60 transition-transform group-hover/button:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </section>
        ) : (
          <div className="grid flex-1 gap-7 py-7 lg:min-h-0 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.7fr)] lg:gap-12 lg:py-10">
            <aside className="flex min-w-0 flex-col lg:min-h-0">
              <p className="font-mono text-[9px] tracking-[0.27em] text-blue-200/60 uppercase">Known worlds / {campaigns.length.toString().padStart(2, "0")}</p>
              <h1 className="mt-3 max-w-sm font-heading text-4xl leading-none text-amber-50 sm:text-5xl">Choose your<br />next world.</h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-violet-100/50">Every campaign is a separate atlas. Select one to browse its scenes or chart somewhere new.</p>
              <div className="mt-7 grid gap-2 lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-y-auto lg:pr-2 [scrollbar-color:rgba(167,139,250,0.28)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-violet-300/25" aria-label="Campaigns">
                {campaigns.map((campaign, index) => {
                  const selected = campaign.id === activeCampaign?.id;
                  const sceneCount = editorScene?.scenes.filter((scene) => scene.campaignId === campaign.id).length ?? 0;
                  return (
                    <Button
                      key={campaign.id}
                      asChild
                      variant="ghost"
                      aria-pressed={selected}
                      className={`group h-auto min-w-0 justify-start rounded-none border px-3 py-3 text-left ${selected ? "border-blue-300/35 bg-blue-400/12 text-white shadow-[inset_3px_0_0_rgba(147,197,253,0.75)]" : "border-violet-200/8 bg-black/10 text-violet-100/65 hover:border-violet-200/20 hover:bg-violet-300/8"}`}
                    >
                      <Link href={`/campaigns/${encodeURIComponent(campaign.id)}`}>
                      <span className="w-7 shrink-0 font-mono text-[9px] text-violet-200/35">{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-heading text-base text-amber-50/90">{campaign.name}</span>
                        <span className="block font-mono text-[8px] tracking-[0.14em] text-violet-200/45 uppercase">{sceneCount} {sceneCount === 1 ? "scene" : "scenes"}</span>
                      </span>
                      <ArrowRight className={`size-3.5 transition ${selected ? "text-blue-200" : "-translate-x-1 text-violet-200/20 group-hover:translate-x-0"}`} aria-hidden="true" />
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </aside>

            <section className="relative flex min-h-[30rem] flex-col overflow-hidden border border-violet-200/12 bg-[#080a1b]/72 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.38)] backdrop-blur-md sm:p-6 lg:min-h-0 lg:p-8" aria-labelledby="campaign-scenes-title">
              <div className="pointer-events-none absolute right-0 top-0 size-56 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_68%)]" />
              {activeCampaign ? (
                <>
                   <div className="relative flex shrink-0 flex-col gap-5 border-b border-violet-200/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-[8px] tracking-[0.24em] text-violet-200/45 uppercase">Active campaign</p>
                      <h2 id="campaign-scenes-title" className="mt-2 truncate font-heading text-3xl text-amber-50 sm:text-4xl">{activeCampaign.name}</h2>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="ghost" size="icon" className="rounded-none text-violet-100/60" aria-label={`Rename ${activeCampaign.name}`} onClick={() => beginRename({ type: "campaign", id: activeCampaign.id, name: activeCampaign.name })} disabled={busy}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button variant="outline" className="rounded-none border-violet-200/15 bg-violet-200/5 text-violet-50 hover:bg-violet-200/10" onClick={() => void runAction(() => editorScene!.exportCampaign(activeCampaign.id))} disabled={busy || campaignScenes.length === 0}>
                        <Download aria-hidden="true" /> Export campaign
                      </Button>
                      <Button variant="outline" className="rounded-none border-violet-200/15 bg-violet-200/5 text-violet-50 hover:bg-violet-200/10" onClick={() => importInput.current?.click()} disabled={busy}>
                        <Upload aria-hidden="true" /> Import .scene
                      </Button>
                      <Button className="rounded-none border border-blue-200/20 bg-blue-500/70 text-blue-50 hover:bg-blue-400/80" onClick={() => startCreation("scene")} disabled={busy}>
                        <FilePlus2 aria-hidden="true" /> New scene
                      </Button>
                      <Button variant="destructive" size="icon" className="rounded-none" aria-label={`Delete ${activeCampaign.name}`} onClick={() => setDeleteTarget({ type: "campaign", id: activeCampaign.id, name: activeCampaign.name })} disabled={busy}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {campaignScenes.length > 0 ? (
                    <div className="relative mt-5 w-full shrink-0">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-violet-200/35" aria-hidden="true" />
                      <Input
                        type="search"
                        value={sceneQuery}
                        onChange={(event) => setSceneQuery(event.target.value)}
                        placeholder="Search scenes"
                        aria-label={`Search scenes in ${activeCampaign.name}`}
                        className="h-10 rounded-none border-violet-200/12 bg-black/15 pl-9 text-violet-50 placeholder:text-violet-200/30"
                      />
                    </div>
                  ) : null}

                  {campaignScenes.length === 0 ? (
                    <div className="relative grid min-h-[23rem] flex-1 place-items-center overflow-y-auto text-center">
                      <div>
                        <div className="mx-auto grid size-16 place-items-center border border-dashed border-violet-200/20 bg-violet-200/5">
                          <FolderOpen className="size-7 text-violet-100/55" strokeWidth={1.2} aria-hidden="true" />
                        </div>
                        <h3 className="mt-5 font-heading text-2xl text-amber-50">This world has no scenes yet.</h3>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-violet-100/50">Begin with a blank Assets and Fog canvas, or bring in a complete Fantassist scene with its media intact.</p>
                        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                          <Button className="rounded-none bg-blue-500/70 text-blue-50" onClick={() => startCreation("scene")}><FilePlus2 aria-hidden="true" /> Create first scene</Button>
                          <Button variant="outline" className="rounded-none border-violet-200/15 bg-transparent" onClick={() => importInput.current?.click()}><Upload aria-hidden="true" /> Import scene</Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative mt-6 lg:min-h-0 lg:flex-1">
                      <div ref={sceneGrid} onScroll={() => {
                        const element = sceneGrid.current;
                        if (element) setHasMoreScenes(element.scrollTop + element.clientHeight < element.scrollHeight - 2);
                      }} className="grid h-full content-start gap-4 lg:overflow-y-auto lg:pr-2 lg:pb-8 [scrollbar-color:rgba(167,139,250,0.28)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-violet-300/25 sm:grid-cols-2 xl:grid-cols-3">
                        {visibleScenes.map((scene, index) => (
                        <div key={scene.key} className="group relative h-44 min-w-0 overflow-hidden border border-violet-200/12 bg-black/20 shadow-[0_14px_38px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-0.5 hover:border-blue-200/35 hover:shadow-[0_20px_48px_rgba(2,6,23,0.48),0_0_28px_rgba(59,130,246,0.08)] focus-within:border-blue-200/35">
                          <SceneCardThumbnail sceneKey={scene.key} version={scene.version} />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08091b]/90 via-[#08091b]/15 via-45% to-transparent" aria-hidden="true" />
                          <div className="pointer-events-none absolute inset-2 border border-white/[0.045] transition-colors duration-300 group-hover:border-blue-100/10" aria-hidden="true" />
                          <div className="pointer-events-none absolute inset-x-2 top-2 h-px origin-left scale-x-0 bg-gradient-to-r from-blue-300/70 via-violet-300/35 to-transparent transition-transform duration-500 group-hover:scale-x-100" aria-hidden="true" />
                          <Link href={sceneHref(scene.key)} className="relative z-10 block h-full p-4 text-left">
                            <span className="absolute right-3 top-3 border border-white/[0.06] bg-black/20 px-1.5 py-1 font-mono text-[8px] tracking-widest text-violet-100/35 backdrop-blur-sm">{String(index + 1).padStart(2, "0")}</span>
                            <span className="grid size-8 place-items-center border border-blue-100/10 bg-[#08091b]/35 text-blue-100/55 backdrop-blur-sm transition duration-300 group-hover:border-blue-100/20 group-hover:text-blue-100">
                              <BookOpen className="size-4" strokeWidth={1.35} aria-hidden="true" />
                            </span>
                            <span className="absolute inset-x-4 bottom-3 min-w-0 translate-y-4 transition-transform duration-300 ease-out group-hover:translate-y-0 group-focus-within:translate-y-0">
                              <span className="line-clamp-2 text-balance font-heading text-xl leading-tight text-amber-50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{scene.name}</span>
                              <span className="mt-1 flex items-center justify-start gap-2 pr-24 font-mono text-[8px] tracking-[0.12em] text-violet-100/55 uppercase opacity-0 transition-opacity delay-75 duration-200 group-hover:opacity-100 group-focus-within:opacity-100"><span>Version {scene.version}</span><ArrowRight className="size-3 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
                            </span>
                          </Link>
                          <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                            <Button size="icon-sm" variant="ghost" className="rounded-none text-violet-100/60" aria-label={`Export ${scene.name}`} disabled={busy} onClick={() => void runAction(() => editorScene!.exportScene(scene.key))}><Download aria-hidden="true" /></Button>
                            <Button size="icon-sm" variant="ghost" className="rounded-none text-violet-100/60" aria-label={`Rename ${scene.name}`} disabled={busy} onClick={() => beginRename({ type: "scene", key: scene.key, name: scene.name })}><Pencil aria-hidden="true" /></Button>
                            <Button size="icon-sm" variant="ghost" className="rounded-none text-red-300/70 hover:text-red-200" aria-label={`Delete ${scene.name}`} disabled={busy} onClick={() => setDeleteTarget({ type: "scene", key: scene.key, name: scene.name })}><Trash2 aria-hidden="true" /></Button>
                          </div>
                        </div>
                        ))}
                        {visibleScenes.length === 0 ? (
                          <p className="col-span-full border border-dashed border-violet-200/12 px-4 py-10 text-center text-sm text-violet-100/45">No scenes match “{sceneQuery.trim()}”.</p>
                        ) : null}
                      </div>
                      {hasMoreScenes ? (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-14 items-end justify-center bg-gradient-to-t from-[#080a1b] via-[#080a1b]/75 to-transparent pb-1 lg:flex" aria-hidden="true">
                          <span className="grid size-5 place-items-center border border-violet-200/15 bg-[#0c0d22]/85 text-violet-100/55 shadow-[0_0_16px_rgba(139,92,246,0.18)]">
                            <ChevronDown className="size-3 animate-bounce" />
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : null}
              {localError || editorScene?.error ? <p role="alert" className="relative mt-4 border border-red-300/20 bg-red-500/8 px-3 py-2 text-xs text-red-200">{localError ?? editorScene?.error}</p> : null}
            </section>
          </div>
        )}
      </div>

      <input ref={importInput} type="file" accept=".scene,application/octet-stream" className="sr-only" aria-label="Import Fantassist scene" onChange={(event) => void importFile(event.target.files?.[0])} />

      <Dialog open={activeCreationMode !== null && !inlineOnboarding} onOpenChange={(open) => {
        if (!open && !busy) {
          setCreationMode(null);
          if (initialCreationMode) router.replace(activeCampaign ? `/campaigns/${encodeURIComponent(activeCampaign.id)}` : "/campaigns");
        }
      }}>
        <DialogContent className="rounded-none border border-violet-200/15 bg-[#0c0b1d]/98 text-white shadow-[0_30px_100px_rgba(0,0,0,0.7)] sm:max-w-md" showCloseButton={!busy}>
          <form onSubmit={(event) => void submitCreation(event)}>
            <DialogHeader>
              <p className="font-mono text-[8px] tracking-[0.24em] text-blue-200/60 uppercase">{activeCreationMode === "campaign" ? "Chart a new world" : "Open a new scene"}</p>
              <DialogTitle className="font-heading text-3xl text-amber-50">Name your {activeCreationMode}</DialogTitle>
              <DialogDescription className="text-violet-100/50">{activeCreationMode === "campaign" ? "You can add or import scenes after the campaign is created." : "A blank scene begins with ready-to-use Assets and Fog layers."}</DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-2">
              <Label htmlFor="creation-name" className="font-mono text-[9px] tracking-[0.16em] text-violet-200/55 uppercase">{activeCreationMode} name</Label>
              <Input id="creation-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="h-11 rounded-none border-violet-200/15 bg-black/20 font-heading text-lg text-amber-50 selection:bg-blue-400/30" />
            </div>
            {localError ? <p role="alert" className="mt-3 text-xs text-red-300">{localError}</p> : null}
            <DialogFooter className="mt-6 -mx-4 -mb-4 rounded-none border-violet-200/10 bg-violet-200/4">
              <Button type="button" variant="ghost" className="rounded-none" disabled={busy} onClick={() => {
                setCreationMode(null);
                if (initialCreationMode) router.replace(activeCampaign ? `/campaigns/${encodeURIComponent(activeCampaign.id)}` : "/campaigns");
              }}>Cancel</Button>
              <Button type="submit" className="rounded-none bg-blue-500/75 text-blue-50" disabled={busy || !name.trim()}>{busy ? "Creating..." : `Create ${activeCreationMode}`}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameTarget !== null} onOpenChange={(open) => { if (!open && !busy) setRenameTarget(null); }}>
        <DialogContent className="rounded-none border border-violet-200/15 bg-[#0c0b1d]/98 text-white sm:max-w-md" showCloseButton={!busy}>
          <form onSubmit={(event) => void submitRename(event)}>
            <DialogHeader>
              <DialogTitle className="font-heading text-3xl text-amber-50">Rename {renameTarget?.type}</DialogTitle>
              <DialogDescription className="text-violet-100/50">Names may be up to 120 characters.</DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-2">
              <Label htmlFor="rename-name">Name</Label>
              <Input id="rename-name" autoFocus value={renameName} onChange={(event) => setRenameName(event.target.value)} maxLength={120} className="rounded-none" />
            </div>
            {localError ? <p role="alert" className="mt-3 text-xs text-red-300">{localError}</p> : null}
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" className="rounded-none" disabled={busy} onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button type="submit" className="rounded-none" disabled={busy || !renameName.trim()}>{busy ? "Saving..." : "Save name"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !busy) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-none border border-violet-200/15 bg-[#0c0b1d]/98 text-white shadow-[0_30px_100px_rgba(0,0,0,0.7)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-3xl text-amber-50">Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription className="text-violet-100/50">
              {deleteTarget?.type === "campaign"
                ? `${deleteTarget.name} and every scene it contains will be permanently deleted.`
                : `${deleteTarget?.name ?? "This scene"} will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none" disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="rounded-none" disabled={busy} onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>{busy ? "Deleting..." : "Delete permanently"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function sceneHref(key: string): string {
  const [campaignId, sceneId] = key.split("/", 2);
  return `/campaigns/${encodeURIComponent(campaignId)}/scenes/${encodeURIComponent(sceneId)}`;
}
