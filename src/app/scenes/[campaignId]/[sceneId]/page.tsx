import { redirect } from "next/navigation";

export default function Page({
  params,
}: {
  params: { campaignId: string; sceneId: string };
}) {
  return redirect(`/campaigns/${params.campaignId}/scenes/${params.sceneId}`);
}
