"use client";
import { redirect, useRouter } from "next/navigation";
import Layout from "../fullScreenLayout";
import campaignDatabase from "../storage";
import CampaignSelector from "../campaignSelector";
import SceneList from "@/app/scenes/list";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import theme from "@/theme";

type Props = { params: { campaignId: string } };
const Page: React.FC<Props> = ({ params }) => {
  const router = useRouter();
  const [campaign, updateCampaign] = campaignDatabase.useOneValue(
    params.campaignId
  );

  if (campaign === undefined) {
    return null; // TODO: loading spinner
  }

  if (campaign === null) {
    return redirect("/campaigns");
  }

  return (
    <Layout
      extraTitleItems={
        <CampaignSelector
          selectedCampaignId={params.campaignId}
          onSelectCampaign={(id) => {
            router.push(`/campaigns/${id}`);
          }}
        />
      }
      loadingText={campaign === undefined ? "Loading campaign..." : null}
    >
      <Box
        sx={{
          maxWidth: 800,
          width: "100%",
          flex: 2,
          alignSelf: "center",
        }}
      >
        <Typography variant="h5" gutterBottom>
          {campaign.name} 
          {/* TODO: edit name button */}
        </Typography>
        <Paper
          sx={{
            paddingY: theme.spacing(1),
            paddingX: theme.spacing(2),
          }}
          elevation={2}
        >
          <Typography variant="h5" gutterBottom>
            Scenes
          </Typography>
          <SceneList
            campaignId={params.campaignId}
            selectedSceneId={null}
            onSceneSelect={(s) => {
              const [, sceneId] = s.id.split("/");
              router.push(`/campaigns/${params.campaignId}/scenes/${sceneId}`);
            }}
          />
        </Paper>
      </Box>
    </Layout>
  );
};
export default Page;
