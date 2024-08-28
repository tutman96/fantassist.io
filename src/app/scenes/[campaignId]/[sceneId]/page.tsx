import { redirect } from "next/navigation";

// This is a nice helper to redirect scene ids to the right campaign path
export default function Page({
  params,
}: {
  params: { campaignId: string; sceneId: string };
}) {
  return redirect(`/campaigns/${params.campaignId}/scenes/${params.sceneId}`);
}
