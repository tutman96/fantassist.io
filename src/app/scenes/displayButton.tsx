import React, { useRef, useState } from "react";

import { alpha } from "@mui/material/styles";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuList from "@mui/material/MenuList";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";

import UploadIcon from "@mui/icons-material/Upload";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import AcUnitOutlinedIcon from "@mui/icons-material/AcUnitOutlined";
import TvIcon from "@mui/icons-material/Tv";
import CancelPresentation from "@mui/icons-material/CancelPresentation";
import PresentToAll from "@mui/icons-material/PresentToAll";
import TvOffIcon from "@mui/icons-material/TvOff";

import { Settings, settingsDatabase } from "../settings";
import { Scene } from "@/protos/scene";
import theme from "@/theme";
import { useConnection, useConnectionState } from "@/external/hooks";
import { ChannelState } from "@/external/abstractChannel";

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
  const connection = useConnection();
  const connectionState = useConnectionState();

  const connected = connectionState === ChannelState.CONNECTED;

  const currentSceneDisplayed = displayedScene === scene.id;

  const buttonColor = connected
    ? currentSceneDisplayed
      ? tableFreeze
        ? "lightblue"
        : theme.palette.success.main
      : "white"
    : "secondary.main";

  return (
    <>
      <Tooltip title="Display">
        <Button
          size="large"
          color="success"
          ref={anchorEl as any}
          sx={{
            color: buttonColor,
            marginRight: theme.spacing(1),
            animation:
              currentSceneDisplayed && connected
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
            connected ? (
              currentSceneDisplayed ? (
                tableFreeze ? (
                  <AcUnitOutlinedIcon />
                ) : (
                  <PlayArrowIcon />
                )
              ) : (
                <TvIcon />
              )
            ) : (
              <TvOffIcon />
            )
          }
        >
          {connected
            ? currentSceneDisplayed
              ? tableFreeze
                ? "FROZEN"
                : "LIVE"
              : "DISPLAY"
            : "DISCONNECTED"}
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
        <MenuList
          dense
          sx={{
            width: 250,
          }}
        >
          <MenuItem
            disabled={!connected}
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
            disabled={!connected || !currentSceneDisplayed}
            onClick={() => {
              updateTableFreeze(!tableFreeze);
              setShowMenu(false);
            }}
          >
            <ListItemIcon>
              <AcUnitOutlinedIcon />
            </ListItemIcon>
            <ListItemText
              primary={tableFreeze ? "Unfreeze Display" : "Freeze Display"}
            />
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={async () => {
              if (connected) {
                await connection.disconnect();
              } else {
                await connection.connect();
              }
              setShowMenu(false);
            }}
            disabled={
              connectionState === ChannelState.CONNECTING ||
              connectionState === ChannelState.DISCONNECTING
            }
            sx={{
              color: connected ? "warning.main" : "initial",
              '&:hover': connected ? {
                backgroundColor: alpha(theme.palette.warning.main, 0.1),
              } : undefined
            }}
          >
            <ListItemIcon
              sx={{
                color: connected ? "warning.main" : "initial",
              }}
            >
              {connected ? <CancelPresentation /> : <PresentToAll />}
            </ListItemIcon>
            <ListItemText
              primary={
                connectionState === ChannelState.DISCONNECTED
                  ? "Launch Display"
                  : connectionState === ChannelState.CONNECTING
                  ? "Connecting to Display..."
                  : "Close Display"
              }
            />
          </MenuItem>
        </MenuList>
      </Menu>
    </>
  );
};
export default TableDisplayButton;
