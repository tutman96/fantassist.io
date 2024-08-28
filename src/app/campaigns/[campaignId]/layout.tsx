"use client";
import { Settings, useOneSettingValue } from "@/app/settings";
import { PropsWithChildren, useEffect } from "react";

const Layout: React.FC<
  PropsWithChildren & { params: { campaignId: string } }
> = ({ children, params }) => {
  const [, setLastCampaign] = useOneSettingValue<string>(
    Settings.LAST_CAMPAIGN
  );

  useEffect(() => {
    setLastCampaign(params.campaignId);
  }, [params.campaignId, setLastCampaign]);

  return children;
};
export default Layout;
