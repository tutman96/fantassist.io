import { useEffect, useRef, useState } from "react";

import Typograph from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

import { useConnection, useRequestHandler } from "@/external/hooks";
import { Settings, settingsDatabase } from "..";
import { generateArucoMarker } from "@/utils";
import useCalibrationScene, { useCornerLocations } from "./calibrationScene";

const CornerMarker = ({
  id,
  highlighted,
}: {
  id: number;
  highlighted: boolean;
}) => {
  return (
    <Box
      sx={{
        backgroundColor: highlighted ? "success.main" : "warning.main",
        color: "rgba(0,0,0,0.7)",
        width: "75px",
        height: "75px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {highlighted ? (
        <CheckCircleIcon fontSize="large" />
      ) : (
        <ErrorIcon fontSize="large" />
      )}
    </Box>
  );
};

type Props = {
  onNext: () => void;
  onPrevious: () => void;
};
const AlignmentStep: React.FC<Props> = ({ onNext, onPrevious }) => {
  const connection = useConnection();
  const overwroteFreezeSetting = useRef<boolean | null>(null);
  const [displayingCalibration, setDisplayingCalibration] = useState(false);
  const [highligtedCorners, setHighlightedCorners] = useState<Array<number>>([]);
  const calibrationScene = useCalibrationScene(highligtedCorners);
  const cornerLocations = useCornerLocations();

  useRequestHandler(async (req) => {
    if (req.getAssetRequest) {
      const id = req.getAssetRequest.id;
      if (!id.startsWith("//aruco/")) {
        return null;
      }

      const [, , , arucoId, highlighted] = id.split("/");

      const svg = generateArucoMarker(
        +arucoId,
        highlighted === "1" ? "rgb(0,255,0)" : undefined
      );

      return {
        getAssetResponse: {
          id,
          payload: new TextEncoder().encode(svg),
          mediaType: "image/svg+xml",
        },
      };
    }
    return null;
  });

  // Freeze the table display while the calibration scene is active, then restore the previous setting once done
  useEffect(() => {
    if (!calibrationScene) return;

    settingsDatabase()
      .storage.getItem<boolean>(Settings.TABLE_FREEZE)
      .then((freeze) => {
        overwroteFreezeSetting.current = freeze;
        return settingsDatabase().storage.setItem(Settings.TABLE_FREEZE, true);
      })
      .then(() => {
        setDisplayingCalibration(true);
      });
    return () => {
      settingsDatabase().storage.setItem(
        Settings.TABLE_FREEZE,
        overwroteFreezeSetting.current ?? false
      );
      setDisplayingCalibration(false);
    };
  }, [calibrationScene?.id]);

  useEffect(() => {
    if (!calibrationScene || !displayingCalibration) return;

    connection.request({
      displaySceneRequest: {
        scene: calibrationScene,
      },
    });
  }, [calibrationScene?.version, displayingCalibration]);

  useEffect(() => {
    if (!displayingCalibration || !cornerLocations) return;

    connection.trackerChannel.request({
      trackerStartCalibrationRequest: {
        corners: cornerLocations,
      },
    })

    const interval = setInterval(async () => {
      const resp = await connection.trackerChannel.request({
        trackerGetCalibrationRequest: {},
      });
      const { foundCorners } = resp.trackerGetCalibrationResponse!;
      setHighlightedCorners(foundCorners);
    }, 100);
    return () => {
      clearInterval(interval)

      // TODO: pull state on mount and restore it on unmount
      connection.trackerChannel.request({
        trackerSetIdleRequest: {},
      })
    };
  }, [displayingCalibration])

  return (
    <>
      <Typograph gutterBottom>
        The next step is to align the camera with the table display. There are 4
        markers on the table, each with a unique ID. Please ensure that the
        markers are visible in the camera feed.
      </Typograph>

      <Box
        sx={{
          marginX: "auto",
          marginY: 4,
          backgroundColor: "black",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "300px",
          width: "400px",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <CornerMarker id={1} highlighted={highligtedCorners.includes(1)} />
          <CornerMarker id={2} highlighted={highligtedCorners.includes(2)} />
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <CornerMarker id={4} highlighted={highligtedCorners.includes(4)} />
          <CornerMarker id={3} highlighted={highligtedCorners.includes(3)} />
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Button
          variant="text"
          color="secondary"
          onClick={onPrevious}
        >
          Previous
        </Button>
        <Button
          variant="contained"
          onClick={onNext}
          disabled={highligtedCorners.length < 4}
        >
          Next
        </Button>
      </Box>
    </>
  );
};
export default AlignmentStep;
