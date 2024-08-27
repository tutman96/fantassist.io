"use client";
import { useRouter } from "next/navigation";
import Layout from "../fullScreenLayout";
import AddCampaignDialog from "../addCampaignDialog";
import { v4 } from "uuid";
import campaignDatabase from "../storage";

// TODO: make this a pretty landing page with lots of cool graphics and whatnots
const Page: React.FC = () => {
  const router = useRouter();
  return (
    <Layout>
      <AddCampaignDialog
        open={true}
        onCancel={() => router.push("/campaigns")}
        onConfirm={(name) => {
          const id = v4();
          campaignDatabase.createItem(id, {
            id,
            name,
          });
          router.push(`/campaigns/${id}`);
        }}
      />
    </Layout>
  );
};
export default Page;
