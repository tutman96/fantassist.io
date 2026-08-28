import { redirect } from "next/navigation";

export default async function LegacyScenePage({ params }: PageProps<"/scenes/[campaignId]/[sceneId]">) {
  const { campaignId, sceneId } = await params;
  redirect(`/campaigns/${encodeURIComponent(campaignId)}/scenes/${encodeURIComponent(sceneId)}`);
}
