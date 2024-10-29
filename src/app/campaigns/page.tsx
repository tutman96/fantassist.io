"use client";
import campaignDatabase from "./storage";

import Layout from "./fullScreenLayout";
import { redirect } from "next/navigation";
import { Settings, useOneSettingValue } from "../settings";

const CampaignsPage: React.FC = () => {
  const campaigns = campaignDatabase.useAllValues();
  const [lastCampaign] = useOneSettingValue<string>(Settings.LAST_CAMPAIGN);

  if (campaigns === undefined) {
    return <Layout loadingText="Loading campaigns..." />;
  }

  if (lastCampaign && campaigns.has(lastCampaign)) {
    return redirect(`/campaigns/${lastCampaign}`);
  } else if (campaigns.size > 0) {
    return redirect(`/campaigns/${campaigns.values().next().value!.id}`);
  } else {
    return redirect("/campaigns/new");
  }
};

export default CampaignsPage;
