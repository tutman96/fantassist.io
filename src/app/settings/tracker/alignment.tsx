import { useEffect, useRef, useState } from "react";

import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

import { useConnection, useRequestHandler } from "@/external/hooks";
import { generateArucoMarker } from "@/utils";
import useCalibrationScene, { useCornerLocations } from "./calibrationScene";
import { useCalibrationSceneOverride } from "./hooks";

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
  const [highligtedCorners, setHighlightedCorners] = useState<Array<number>>([]);
  const cornerLocations = useCornerLocations();

  const calibrationScene = useCalibrationScene(highligtedCorners);
  const overrideActive = useCalibrationSceneOverride(calibrationScene);

  const wrapWaiting = (fn: () => void) => {
    return () => {
      if (overrideActive) {
        connection.trackerChannel.request({
          trackerSetIdleRequest: {},
        }).then(fn);
      } else {
        fn()
      }
    }
  }

  const waitingNext = wrapWaiting(onNext);
  const waitingPrevious = wrapWaiting(onPrevious);

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

  useEffect(() => {
    if (!overrideActive || !cornerLocations) return;

    let running = true;

    (async () => {
      await connection.trackerChannel.request({
        trackerStartCalibrationRequest: {
          corners: cornerLocations,
        },
      });

      while (running) {
        const resp = await connection.trackerChannel.request({
          trackerGetCalibrationRequest: {},
        });
        const { foundCorners } = resp.trackerGetCalibrationResponse!;
        setHighlightedCorners(foundCorners);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })()

    return () => {
      running = false;
    };
  }, [overrideActive])

  return (
    <>
      <Typography gutterBottom>
        The next step is to align the camera with the table display. There are 4
        markers on the table, each with a unique ID. Please ensure that the
        markers are visible in the camera feed.
      </Typography>

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
          onClick={waitingPrevious}
        >
          Previous
        </Button>
        <Button
          variant="contained"
          onClick={waitingNext}
          disabled={highligtedCorners.length < 4}
        >
          Next
        </Button>
      </Box>
    </>
  );
};
export default AlignmentStep;
