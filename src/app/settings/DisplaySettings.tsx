import React from "react";

import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import CancelPresentation from "@mui/icons-material/CancelPresentation";
import PresentToAll from "@mui/icons-material/PresentToAll";

import { useConnection, useConnectionState } from "@/external/hooks";
import { ChannelState } from "@/external/abstractChannel";
import theme from "@/theme";
import ScreenSizeSettings from "./ScreenSizeSettings";
import { DisplayTypes, useDisplayPreference } from ".";
import InputGroup from "@/partials/inputGroup";

const ChannelSelector: React.FunctionComponent = () => {
  const connection = useConnection();
  const connectionState = useConnectionState();
  const [displayPreference, setDisplayPreference] = useDisplayPreference();
  const supportedChannels = connection.supportedChannels;

  if (displayPreference === undefined || supportedChannels.length === 1) {
    return null;
  }

  return (
    <InputGroup header="Display Type">
      <Select
        value={displayPreference ?? connection.supportedChannels[0]}
        onChange={(e) => setDisplayPreference(e.target.value as DisplayTypes)}
        disabled={connectionState !== ChannelState.DISCONNECTED}
        fullWidth
      >
        <MenuItem
          value="presentationApi"
          disabled={!supportedChannels.some((c) => c === "presentationApi")}
        >
          Presentation API (preferred)
        </MenuItem>
        <MenuItem
          value="window"
          disabled={!supportedChannels.some((c) => c === "window")}
        >
          New Window
        </MenuItem>
      </Select>
    </InputGroup>
  );
};

const DisplayButton: React.FunctionComponent = () => {
  const connection = useConnection();
  const connectionState = useConnectionState();

  const connected = connectionState === ChannelState.CONNECTED;

  return (
    <>
      <ChannelSelector />

      <Button
        onClick={() => {
          if (connected) {
            connection.disconnect();
          } else {
            connection.connect();
          }
        }}
        startIcon={connected ? <CancelPresentation /> : <PresentToAll />}
        fullWidth
        variant="contained"
        color={connected ? "warning" : "primary"}
        disabled={
          connectionState === ChannelState.CONNECTING ||
          connectionState === ChannelState.DISCONNECTING
        }
        size="large"
      >
        {connectionState === ChannelState.DISCONNECTED && "Launch Display"}
        {connectionState === ChannelState.CONNECTING &&
          "Connecting to Display..."}
        {connected && "Close Display"}
      </Button>
    </>
  );
};

const DisplaySettings: React.FunctionComponent = () => {
  return (
    <>
      <ScreenSizeSettings />
      <Divider sx={{ marginY: theme.spacing(2) }} />
      <DisplayButton />
    </>
  );
};

export default DisplaySettings;
