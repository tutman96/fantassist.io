"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Orbit } from "lucide-react";

import { CampaignObservatory } from "@/features/campaigns/campaign-observatory";
import { EditorShell } from "@/features/editor/editor-shell";
import { useEditorScene } from "@/features/scenes/editor-scene-context";

export function CampaignIndexRoute() {
  const editorScene = useEditorScene();
  if (!editorScene || editorScene.status === "loading") return <RouteLoading label="Locating your campaigns" />;
  return <CampaignObservatory />;
}

export function CampaignRoute({ campaignId }: { readonly campaignId: string }) {
  const router = useRouter();
  const editorScene = useEditorScene();
  const exists = editorScene?.campaigns.some((campaign) => campaign.id === campaignId) ?? false;

  useEffect(() => {
    if (!editorScene || editorScene.status === "loading") return;
    if (!exists) {
      router.replace("/campaigns");
      return;
    }
    if (editorScene.activeCampaignId !== campaignId) {
      void editorScene.selectCampaign(campaignId).catch(() => router.replace("/campaigns"));
    }
  }, [campaignId, editorScene, exists, router]);

  if (!editorScene || editorScene.status === "loading" || !exists) {
    return <RouteLoading label="Opening campaign atlas" />;
  }
  return <CampaignObservatory campaignId={campaignId} />;
}

export function SceneEditorRoute({ campaignId, sceneId }: {
  readonly campaignId: string;
  readonly sceneId: string;
}) {
  const router = useRouter();
  const editorScene = useEditorScene();
  const key = `${campaignId}/${sceneId}`;
  const exists = editorScene?.scenes.some((scene) => scene.key === key) ?? false;

  useEffect(() => {
    if (!editorScene || editorScene.status === "loading") return;
    if (!exists) {
      router.replace(`/campaigns/${encodeURIComponent(campaignId)}`);
      return;
    }
    if (editorScene.activeSceneKey !== key) {
      void editorScene.selectScene(key).catch(() => router.replace(`/campaigns/${encodeURIComponent(campaignId)}`));
    }
  }, [campaignId, editorScene, exists, key, router]);

  if (!editorScene || !exists || editorScene.activeSceneKey !== key || editorScene.status === "loading") {
    return <RouteLoading label="Calibrating scene workspace" />;
  }
  return <EditorShell />;
}

export function RouteLoading({ label = "Reading the campaign archive" }: { readonly label?: string }) {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-[#03040c] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(91,33,182,0.2),transparent_32%),linear-gradient(145deg,#03040c,#08091b_55%,#12091c)]" />
      <div className="relative grid justify-items-center gap-4">
        <span className="relative grid size-14 place-items-center border border-violet-200/15 bg-violet-200/5">
          <Orbit className="size-7 text-violet-100/50" strokeWidth={1.2} aria-hidden="true" />
          <LoaderCircle className="absolute -inset-2 size-[4.5rem] animate-spin text-blue-300/25 motion-reduce:animate-none" strokeWidth={0.7} aria-hidden="true" />
        </span>
        <p className="font-mono text-[9px] tracking-[0.22em] text-violet-100/55 uppercase">{label}</p>
      </div>
    </main>
  );
}
