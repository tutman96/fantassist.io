import { useParams } from "next/navigation";

export const useCampaignId = (): string | undefined => {
  return useParams<{ campaignId: string }>().campaignId;
};
