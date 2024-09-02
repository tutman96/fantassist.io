import { ChannelState } from "@/external/abstractChannel";
import { useConnection, useConnectionState } from "@/external/hooks";

import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Divider from "@mui/material/Divider";

import BluetoothSearchingIcon from "@mui/icons-material/BluetoothSearching";
import BluetoothConnectedIcon from "@mui/icons-material/BluetoothConnected";
import BluetoothDisabledIcon from "@mui/icons-material/BluetoothDisabled";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";

import { useEffect, useState } from "react";
import Link from "next/link";
import TrackerCalibrationDialog from "./tracker/calibrationDialog";

const TrackerSettings: React.FunctionComponent = () => {
  const contextConnection = useConnection();
  const tracker = contextConnection.trackerChannel;
  const connectionState = useConnectionState(tracker);
  const [showCalibration, setShowCalibration] = useState(false);

  useEffect(() => {
    if (connectionState === ChannelState.CONNECTED) {
      tracker.request({ helloRequest: {} });
    }
  }, [tracker, connectionState]);

  if (!tracker.isSupported) {
    return (
      <Alert severity="warning">
        <AlertTitle>
          Fantassist Tracker not supported in this browser.
        </AlertTitle>
        Please use Google Chrome if you want to use the Fantassist Tracker. You
        can learn more about the Tracker here:{" "}
        <Link href="https://github.com/tutman96/fantassist.io" target="_blank">
          https://github.com/tutman96/fantassist.io
        </Link>
      </Alert>
    );
  }

  return (
    <>
      <Button
        onClick={() => {
          if (connectionState === "CONNECTED") {
            tracker.disconnect();
          } else {
            tracker.connect();
          }
        }}
        fullWidth
        size="large"
        startIcon={
          connectionState === ChannelState.CONNECTED ? (
            <BluetoothDisabledIcon />
          ) : connectionState === ChannelState.CONNECTING ? (
            <BluetoothSearchingIcon />
          ) : (
            <BluetoothConnectedIcon />
          )
        }
        variant="contained"
        color={
          connectionState === ChannelState.CONNECTED ? "warning" : "primary"
        }
        disabled={
          !tracker.isSupported || connectionState === ChannelState.CONNECTING
        }
      >
        {connectionState === ChannelState.CONNECTING && "Connecting..."}
        {connectionState === ChannelState.DISCONNECTED && "Connect to Tracker"}
        {connectionState === ChannelState.CONNECTED &&
          "Disconnect from Tracker"}
      </Button>
      <Divider
        sx={{
          marginY: 2,
        }}
      />
      <Button
        onClick={() => {
          setShowCalibration(true);
        }}
        startIcon={<CenterFocusStrongIcon />}
        fullWidth
        variant="outlined"
        color="secondary"
        disabled={connectionState !== ChannelState.CONNECTED}
      >
        Start Calibration
      </Button>
      {showCalibration && (
        <TrackerCalibrationDialog
          open={showCalibration}
          onClose={() => setShowCalibration(false)}
        />
      )}
    </>
  );
};
export default TrackerSettings;
