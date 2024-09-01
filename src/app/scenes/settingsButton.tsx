import { useState } from "react";
import { lighten } from "@mui/material/styles";

import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";

import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";
import theme from "@/theme";
import DisplaySettings from "../settings/DisplaySettings";

enum SETTINGS_TABS {
  DISPLAY = "Display",
  AUDIO = "Audio",
  DEVICES = "Devices",
  ABOUT = "About",
}

type Props = {};
const SettingsButton: React.FC<Props> = ({}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTab, setSelectedTab] = useState(SETTINGS_TABS.DISPLAY);

  return (
    <>
      <Tooltip title="Settings">
        <IconButton size="large" onClick={() => setShowSettings(true)}>
          <SettingsIcon />
        </IconButton>
      </Tooltip>
      <Dialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        maxWidth="md"
      >
        <DialogTitle
          sx={{
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          Settings
        </DialogTitle>
        <IconButton
          aria-label="close"
          onClick={() => setShowSettings(false)}
          sx={(theme) => ({
            position: "absolute",
            right: 12,
            top: 12,
            color: theme.palette.grey[500],
          })}
        >
          <CloseIcon />
        </IconButton>
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Box
            sx={{
              background: theme.palette.background.default,
              width: 200,
              textAlign: "right",
            }}
          >
            <List dense>
              {Object.values(SETTINGS_TABS).map((tab) => (
                <ListItem key={tab} disablePadding>
                  <ListItemButton
                    onClick={() => setSelectedTab(tab)}
                    selected={selectedTab === tab}
                  >
                    {tab}
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
          <Box
            sx={{
              width: 600,
              minHeight: "800px",
              padding: theme.spacing(2),
              background: lighten(theme.palette.background.default, 0.12),
            }}
          >
            {(() => {
              switch (selectedTab) {
                case SETTINGS_TABS.DISPLAY:
                  return <DisplaySettings />;
                default:
                  return (
                    <Typography variant="overline" color="secondary.main">
                      Coming soon
                    </Typography>
                  );
              }
            })()}
          </Box>
        </Box>
      </Dialog>
    </>
  );
};

export default SettingsButton;
