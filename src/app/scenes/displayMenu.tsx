import React, { useCallback } from "react";

import Button from "@mui/material/Button";

import TabIcon from "@mui/icons-material/Tab";
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

  if (
    connectionState !== ChannelState.DISCONNECTED &&
    !(connection instanceof PresentationApiChannel)
  ) {
    return (
      <Button startIcon={<PresentToAll />} fullWidth disabled>
        Open Display Fullscreen
      </Button>
    );
  }
  if (connectionState === ChannelState.CONNECTED) {
    return (
      <Button
        onClick={() => connection.disconnect()}
        fullWidth
        color="warning"
        startIcon={<CancelPresentation />}
      >
        Disconnect Fullscreen Display
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
    <Button onClick={connect} startIcon={<PresentToAll />} fullWidth>
      Open Display Fullscreen
    </Button>
  );
};

const DisplayMenu: React.FunctionComponent = () => {
  return (
    <>
      <FullscreenButton />
      <Button href="/table" target="_blank" startIcon={<TabIcon />} fullWidth>
        Open Display as Tab
      </Button>
    </>
  );
};

export default DisplayMenu;
