"use client";
import campaignDatabase from "./storage";

import Layout from "./fullScreenLayout";
import { redirect } from "next/navigation";

const CampaignsPage: React.FC = () => {
  const campaigns = campaignDatabase.useAllValues();

  if (campaigns === undefined) {
    return <Layout loadingText="Loading campaigns..." />;
  }

  if (campaigns.size > 0) {
    // TODO: load this from the last selected campaign
    return redirect(`/campaigns/${campaigns.values().next().value.id}`);
  } else {
    return redirect("/campaigns/new");
  }
};

export default CampaignsPage;
