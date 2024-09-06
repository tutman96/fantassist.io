
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { useCalibrationSceneOverride } from "./hooks";
import { AssetLayer_Asset_AssetType, Layer_LayerType, Marker, Scene } from "@/protos/scene";
import { useConnection, useRequestHandler } from "@/external/hooks";
import { useEffect, useState } from "react";
import { useTableDimensions } from "..";

function useValidationScene(markers: Marker[]): Scene | undefined {
  return {
    id: "calibration-validation",
    version: Date.now(),
    name: "Calibration Validation",
    table: {
      displayGrid: true,
      offset: {
        x: 0,
        y: 0,
      },
      scale: 1,
      rotation: 0,
    },
    layers: [{
      markerLayer: {
        id: "calibration-validation-markers",
        type: Layer_LayerType.MARKERS,
        name: "Markers",
        visible: true,
        markers,
      }
    }],
  }
}

type Props = {
  onNext: () => void;
  onPrevious: () => void;
};
const ValidationStep: React.FC<Props> = ({ onNext, onPrevious }) => {
  const connection = useConnection();
  const [markers, setMarkers] = useState<Array<Marker>>([]);
  const validationScene = useValidationScene(markers);
  const overrideActive = useCalibrationSceneOverride(validationScene);

  useRequestHandler(async (req) => {
    if (req.getAssetRequest) {
      const id = req.getAssetRequest.id;
      if (!id.startsWith("//marker/")) {
        return null;
      }

      // const [, , , markerId] = id.split("/"); // TODO: do something with markerId

      // Material Radio Button Checked Icon
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="white"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><circle cx="12" cy="12" r="5"/></svg>`

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
    if (!overrideActive) return;

    let running = true;

    (async () => {
      await connection.trackerChannel.request({
        trackerStartTrackingRequest: {
        },
      });

      while (running) {
        const resp = await connection.trackerChannel.request({
          trackerGetMarkerLocationRequest: {},
        });
        const { markerLocations } = resp.trackerGetMarkerLocationResponse!;

        setMarkers(Array.from(Object.entries(markerLocations)).map(([id, markerLocation]) => ({
          id,
          asset: {
            id: `//marker/${id}`,
            size: {
              width: 1,
              height: 1,
            },
            transform: {
              height: 1,
              width: 1,
              x: markerLocation.x - 0.5,
              y: markerLocation.y - 0.5,
              rotation: 0,
            },
            type: AssetLayer_Asset_AssetType.IMAGE,
          },
        })));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    })()

    return () => {
      running = false;

      // TODO: pull state on mount and restore it on unmount
      connection.trackerChannel.request({
        trackerSetIdleRequest: {},
      })
    };
  }, [overrideActive])

  return (
    <>
      <Typography gutterBottom>
        Finally we are going to validate that the calibration process worked correctly.
      </Typography>
      <br />
      {overrideActive && <Typography gutterBottom>
        The display will have gone blank with just a grid shown. Place one or many markers on the grid and validate that they are tracked correctly.
        Once you are happy with the results, click &quot;Finish&quot; to save the calibration.
      </Typography>}

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
        >
          Finish
        </Button>
      </Box>
    </>
  );
}
export default ValidationStep;
