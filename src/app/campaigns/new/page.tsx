"use client";
import { useRouter } from "next/navigation";
import Layout from "../fullScreenLayout";
import EditCampaignDialog from "../campaignRenameDialog";
import { v4 } from "uuid";
import campaignDatabase from "../storage";
import { useEffect, useRef } from "react";

// TODO: make this a pretty landing page with lots of cool graphics and whatnots
const Page: React.FC = () => {
  const router = useRouter();
  const id = useRef<string>(v4());
  useEffect(() => {
    router.prefetch(`/campaigns/${id.current}`);
  }, [router, id]);

  return (
    <Layout>
      <EditCampaignDialog
        name="Untitled Campaign"
        isNew
        open={true}
        onCancel={() => router.push("/campaigns")}
        onConfirm={(name) => {
          campaignDatabase.createItem(id.current, {
            id: id.current,
            name,
          });
          router.push(`/campaigns/${id}`);
        }}
      />
    </Layout>
  );
};
export default Page;
