"use client";
import { redirect, useRouter } from "next/navigation";
import Layout from "../fullScreenLayout";
import campaignDatabase from "../storage";
import CampaignSelector from "../campaignSelector";
import SceneList from "@/app/scenes/list";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";

import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

import theme from "@/theme";
import CampaignRenameDialog from "../campaignRenameDialog";
import { useState } from "react";
import { exportAllScenes } from "@/app/scenes";

type Props = { params: { campaignId: string } };
const Page: React.FC<Props> = ({ params }) => {
  const router = useRouter();
  const [campaign, updateCampaign] = campaignDatabase.useOneValue(
    params.campaignId
  );
  const [showEditDialog, setShowEditDialog] = useState(false);

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
      {campaign && (
        <>
          <Box
            sx={{
              maxWidth: 1000,
              width: "100%",
              flex: 2,
              alignSelf: "center",
            }}
          >
            <Paper
              sx={{
                paddingY: theme.spacing(3),
                paddingX: theme.spacing(3),
              }}
              elevation={1}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignContent: "center",
                }}
              >
                <Typography variant="h5" gutterBottom>
                  {campaign.name}
                </Typography>
                <Box>
                  <IconButton
                    size="small"
                    color="secondary"
                    onClick={() => setShowEditDialog(true)}
                  >
                    <EditOutlinedIcon />
                  </IconButton>
                </Box>
                <Box sx={{ flex: 2 }} />
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<DownloadOutlinedIcon />}
                  size="small"
                  sx={{ height: theme.spacing(4) }}
                  onClick={() => {
                    exportAllScenes(params.campaignId, campaign.name);
                  }}
                >
                  Download Campaign
                </Button>
              </Box>
              <SceneList
                campaignId={params.campaignId}
                selectedSceneId={null}
                onSceneSelect={(s) => {
                  const [, sceneId] = s.id.split("/");
                  router.push(
                    `/campaigns/${params.campaignId}/scenes/${sceneId}`
                  );
                }}
              />
            </Paper>
          </Box>
          <CampaignRenameDialog
            name={campaign.name}
            open={showEditDialog}
            onCancel={() => setShowEditDialog(false)}
            onConfirm={(name) => {
              updateCampaign({ ...campaign, name });
              setShowEditDialog(false);
            }}
          />
        </>
      )}
    </Layout>
  );
};
export default Page;
