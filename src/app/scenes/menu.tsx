import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Modal from "@mui/material/Modal";

import theme from "@/theme";
import SceneList from "./list";
import FloatingIcon from "@/partials/floatingIcon";
import * as Types from "@/protos/scene";
import CampaignSelector from "../campaigns/campaignSelector";

type Props = { campaignId: string; sceneId: string };
const Menu: React.FunctionComponent<Props> = ({ campaignId, sceneId }) => {
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const location = usePathname();
  const router = useRouter();

  function onSceneSelect(scene: Types.Scene) {
    router.push(`/scenes/${scene.id}`);
  }

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  return (
    <>
      <FloatingIcon onClick={() => setMenuOpen(!menuOpen)} active={menuOpen} />
      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        sx={{ zIndex: theme.zIndex.appBar + 1 }}
      >
        <Card
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            margin: theme.spacing(1),
            width: "100%",
            maxWidth: theme.spacing(64),
            maxHeight: "100%",
            display: "flex",
            flexDirection: "column",
          }}
          elevation={1}
        >
          <Box
            sx={{
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignContent: "center",
                marginLeft: "32px",
                paddingY: theme.spacing(1),
                paddingX: theme.spacing(2),
                height: "48px",
              }}
            >
              <CampaignSelector
                selectedCampaignId={campaignId}
                onSelectCampaign={(id) => {
                  if (id === campaignId) return;
                  router.push(`/campaigns/${id}`);
                  setMenuOpen(false);
                }}
              />
            </Box>
            <Box
              sx={{
                paddingY: theme.spacing(1),
                paddingX: theme.spacing(2),
              }}
            >
              <SceneList
                campaignId={campaignId}
                onSceneSelect={onSceneSelect}
                selectedSceneId={sceneId}
              />
            </Box>
          </Box>
        </Card>
      </Modal>
    </>
  );
};

export default Menu;
