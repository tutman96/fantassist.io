import { CampaignRoute } from "@/features/campaigns/campaign-routes";

export default async function CampaignPage({ params }: PageProps<"/campaigns/[campaignId]">) {
  const { campaignId } = await params;
  return <CampaignRoute campaignId={campaignId} />;
}
