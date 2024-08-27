"use client";
import { useState } from "react";
import campaignDatabase from "./storage";

import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Icon from "@mui/material/Icon";
import theme from "@/theme";

import CollectionsBookmarkOutlinedIcon from "@mui/icons-material/CollectionsBookmarkOutlined";
import Layout from "./fullScreenLayout";
import AddCampaignDialog from "./addCampaignDialog";
import { v4 } from "uuid";
import { redirect, useRouter } from "next/navigation";

const CampaignsPage: React.FC = () => {
  const router = useRouter();
  const campaigns = campaignDatabase.useAllValues();
  const [showAddDialog, setShowAddDialog] = useState(false);

  if (campaigns === undefined) {
    return <Layout loadingText="Loading campaigns..." />;
  }

  if (campaigns !== undefined && campaigns.size > 0) {
    // TODO: load this from the last selected campaign
    return redirect(`/campaigns/${campaigns.values().next().value.id}`);
  }

  return (
    <Layout>
      {campaigns.size === 0 && (
        <>
          <Icon
            sx={{
              marginBottom: theme.spacing(2),
            }}
            fontSize="large"
            color="disabled"
          >
            <CollectionsBookmarkOutlinedIcon fontSize="large" />
          </Icon>
          <Typography sx={{ marginBottom: theme.spacing(2) }}>
            Add a campaign to get started
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setShowAddDialog(true)}
          >
            Add Campaign
          </Button>
        </>
      )}
      <AddCampaignDialog
        open={showAddDialog}
        onCancel={() => setShowAddDialog(false)}
        onConfirm={(name) => {
          const id = v4();
          campaignDatabase.createItem(id, {
            id,
            name,
          });
          setShowAddDialog(false);
          router.push(`/campaigns/${id}`);
        }}
      />
    </Layout>
  );
};

export default CampaignsPage;
