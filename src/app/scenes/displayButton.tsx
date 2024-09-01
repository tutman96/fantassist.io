import React, { useRef, useState } from "react";

import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuList from "@mui/material/MenuList";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";

import UploadIcon from "@mui/icons-material/Upload";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import AcUnitOutlinedIcon from "@mui/icons-material/AcUnitOutlined";
import DisplaySettingsOutlinedIcon from "@mui/icons-material/DisplaySettingsOutlined";

import { Settings, settingsDatabase } from "../settings";
import { Scene } from "@/protos/scene";
import theme from "@/theme";
import DisplaySettings from "../settings/DisplaySettings";

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
  const [showMenu, setShowMenu] = useState(false);
  const anchorEl = useRef<HTMLElement>();

  const currentSceneDisplayed = displayedScene === scene.id;

  const buttonColor = currentSceneDisplayed
    ? tableFreeze
      ? "lightblue"
      : theme.palette.success.main
    : theme.palette.secondary.main;

  return (
    <>
      <Tooltip title="Display Settings">
        <Button
          size="large"
          color="success"
          ref={anchorEl as any}
          sx={{
            color: buttonColor,
            marginRight: theme.spacing(1),
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
          onClick={() => setShowMenu(true)}
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
      <Menu
        open={showMenu}
        onClose={() => setShowMenu(false)}
        anchorEl={anchorEl.current!}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        elevation={7}
      >
        <MenuList dense>
          <MenuItem
            onClick={() => {
              updateDisplayedScene(!currentSceneDisplayed ? scene.id : null);
              updateTableFreeze(false);
              setShowMenu(false);
            }}
          >
            <ListItemIcon>
              {currentSceneDisplayed ? <VisibilityOffIcon /> : <UploadIcon />}
            </ListItemIcon>
            <ListItemText
              primary={
                currentSceneDisplayed ? "Hide Display" : "Send to Display"
              }
            />
          </MenuItem>
          <MenuItem
            color="primary"
            disabled={!currentSceneDisplayed}
            onClick={() => {
              updateTableFreeze(!tableFreeze);
              setShowMenu(false);
            }}
          >
            <ListItemIcon>
              <AcUnitOutlinedIcon />
            </ListItemIcon>
            <ListItemText
              primary={tableFreeze ? "Unfreeze Table" : "Freeze Table"}
            />
          </MenuItem>
        </MenuList>
      </Menu>
    </>
  );
};
export default TableDisplayButton;
