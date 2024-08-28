import React, { useCallback } from "react";

import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";

import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import CancelPresentation from "@mui/icons-material/CancelPresentation";
import PresentToAll from "@mui/icons-material/PresentToAll";

import { useConnection, useConnectionState } from "@/external/hooks";
import { ChannelState } from "@/external/abstractChannel";
import PresentationApiChannel from "@/external/presentationApiChannel";

const FullscreenButton: React.FunctionComponent = () => {
  const connection = useConnection();
  const connectionState = useConnectionState();

  const connect = useCallback(async () => {
    try {
      await connection.connect();
    } catch (e) {
      console.warn("Failed to connect to fullscreen display", e);
    }
  }, [connection]);

  if (connectionState === ChannelState.CONNECTED) {
    return (
      <Button
        onClick={() => connection.disconnect()}
        fullWidth
        color="warning"
        startIcon={<CancelPresentation />}
      >
        Disconnect Fullscreen
      </Button>
    );
  }
  if (connectionState === ChannelState.CONNECTING) {
    return (
      <Button disabled fullWidth>
        Connecting to Fullscreen...
      </Button>
    );
  }
  return (
    <Button
      onClick={connect}
      startIcon={<PresentToAll />}
      fullWidth
      color="secondary"
    >
      Open Fullscreen
    </Button>
  );
};

const DisplayMenu: React.FunctionComponent = () => {
  return (
    <ButtonGroup fullWidth variant="text" color="secondary">
      <FullscreenButton />
      <Button
        href="/table"
        color="secondary"
        target="fantassist-table"
        startIcon={<OpenInNewOutlinedIcon />}
        fullWidth
      >
        Open as Tab
      </Button>
    </ButtonGroup>
  );
};

export default DisplayMenu;
