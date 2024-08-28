import React, { useState } from "react";
import { lighten } from "@mui/material/styles";

import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";

import UploadIcon from "@mui/icons-material/Upload";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import AcUnitOutlinedIcon from "@mui/icons-material/AcUnitOutlined";
import DisplaySettingsOutlinedIcon from "@mui/icons-material/DisplaySettingsOutlined";
import CloseIcon from "@mui/icons-material/Close";

import { Settings, settingsDatabase } from "../settings";
import { Scene } from "@/protos/scene";
import theme from "@/theme";
import DisplayMenu from "./displayMenu";
import ScreenSizeSettings from "../settings/ScreenSizeSettings";

const { useOneValue: useOneSettingValue } = settingsDatabase();

const TableDisplayButton: React.FunctionComponent<{ scene: Scene }> = ({
  scene,
}) => {
  const [displayedScene, updateDisplayedScene] = useOneSettingValue(
    Settings.DISPLAYED_SCENE
  );
  const [tableFreeze, updateTableFreeze] = useOneSettingValue(
    Settings.TABLE_FREEZE
  );
  const [showModal, setShowModal] = useState(false);

  const currentSceneDisplayed = displayedScene === scene.id;

  const buttonColor = currentSceneDisplayed
    ? tableFreeze
      ? "lightblue"
      : theme.palette.success.main
    : theme.palette.secondary.main;
  console.log("buttonColor", buttonColor);
  return (
    <>
      <Tooltip title="Display Settings">
        <Button
          size="large"
          sx={{
            color: buttonColor,
            animation: currentSceneDisplayed
              ? `pulse-${tableFreeze ? "freeze" : "play"} 2s infinite`
              : "none",
            "@keyframes pulse-freeze": {
              "0%": {
                boxShadow: "0 0 0px 1px lightblue",
              },
              "50%": {
                boxShadow: "0 0 0px 3px lightblue",
              },
              "100%": {
                boxShadow: "0 0 0px 1px lightblue",
              },
            },
            "@keyframes pulse-play": {
              "0%": {
                boxShadow: `0 0 0px 1px ${theme.palette.success.main}`,
              },
              "50%": {
                boxShadow: `0 0 0px 3px ${theme.palette.success.main}`,
              },
              "100%": {
                boxShadow: `0 0 0px 1px ${theme.palette.success.main}`,
              },
            },
          }}
          onClick={() => setShowModal(true)}
          endIcon={
            currentSceneDisplayed ? (
              tableFreeze ? (
                <AcUnitOutlinedIcon />
              ) : (
                <PlayArrowIcon />
              )
            ) : (
              <DisplaySettingsOutlinedIcon />
            )
          }
        >
          {currentSceneDisplayed
            ? tableFreeze
              ? "FROZEN"
              : "LIVE"
            : "DISPLAY"}
        </Button>
      </Tooltip>
      <Dialog open={showModal} onClose={() => setShowModal(false)}>
        <DialogTitle>Display Settings</DialogTitle>
        <IconButton
          aria-label="close"
          onClick={() => setShowModal(false)}
          sx={(theme) => ({
            position: "absolute",
            right: 8,
            top: 8,
            color: theme.palette.grey[500],
          })}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent>
          <ScreenSizeSettings />
          <Divider sx={{ marginY: theme.spacing(2) }} />
          <DisplayMenu />
          <ButtonGroup
            fullWidth
            sx={{
              marginTop: theme.spacing(2),
            }}
          >
            <Button
              startIcon={
                currentSceneDisplayed ? <VisibilityOffIcon /> : <UploadIcon />
              }
              variant={currentSceneDisplayed ? "contained" : "outlined"}
              color={currentSceneDisplayed ? "success" : "primary"}
              onClick={() => {
                updateDisplayedScene(!currentSceneDisplayed ? scene.id : null);
                updateTableFreeze(false);
              }}
            >
              {currentSceneDisplayed ? "Hide Display" : "Send to Display"}
            </Button>
            <Button
              startIcon={<AcUnitOutlinedIcon />}
              variant={tableFreeze ? "contained" : "outlined"}
              color="primary"
              disabled={!currentSceneDisplayed}
              onClick={() => updateTableFreeze(!tableFreeze)}
            >
              {tableFreeze ? "Unfreeze Table" : "Freeze Table"}
            </Button>
          </ButtonGroup>
        </DialogContent>
      </Dialog>
    </>
  );
};
export default TableDisplayButton;
