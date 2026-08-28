import { SceneEditorRoute } from "@/features/campaigns/campaign-routes";

export default async function ScenePage({ params }: PageProps<"/campaigns/[campaignId]/scenes/[sceneId]">) {
  const { campaignId, sceneId } = await params;
  return <SceneEditorRoute campaignId={campaignId} sceneId={sceneId} />;
}
