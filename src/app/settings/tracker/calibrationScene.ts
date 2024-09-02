import {
  AssetLayer_Asset_AssetType,
  Layer_LayerType,
  Scene,
} from "@/protos/scene";
import { useTableDimensions } from "..";

const PADDING = 0.1;

const useCalibrationScene = (
  highligtedCorners: Array<number>
): Scene | undefined => {
  const dims = useTableDimensions();

  if (!dims) {
    return undefined;
  }

  function getAssetId(corner: number) {
    return `//aruco/${corner}/${
      highligtedCorners.includes(corner) ? 1 : 0
    }`;
  }

  return {
    id: "calibration",
    name: "Calibration",
    version: Date.now(),
    table: {
      displayGrid: false,
      offset: {
        x: 0,
        y: 0,
      },
      scale: 1,
      rotation: 0,
    },
    layers: [
      {
        assetLayer: {
          id: "calibration",
          name: "Calibration",
          visible: true,
          type: Layer_LayerType.ASSETS,
          assets: {
            [getAssetId(1)]: {
              id: getAssetId(1),
              type: AssetLayer_Asset_AssetType.IMAGE,
              size: {
                width: 1,
                height: 1,
              },
              transform: {
                x: PADDING,
                y: PADDING,
                height: 1,
                width: 1,
                rotation: 0,
              },
            },
            [getAssetId(2)]: {
              id: getAssetId(2),
              type: AssetLayer_Asset_AssetType.IMAGE,
              size: {
                width: 1,
                height: 1,
              },
              transform: {
                x: dims?.width - PADDING,
                y: PADDING,
                height: 1,
                width: 1,
                rotation: 90,
              },
            },
            [getAssetId(3)]: {
              id: getAssetId(3),
              type: AssetLayer_Asset_AssetType.IMAGE,
              size: {
                width: 1,
                height: 1,
              },
              transform: {
                x: dims.width - PADDING,
                y: dims.height - PADDING,
                height: 1,
                width: 1,
                rotation: 180,
              },
            },
            [getAssetId(4)]: {
              id: getAssetId(4),
              type: AssetLayer_Asset_AssetType.IMAGE,
              size: {
                width: 1,
                height: 1,
              },
              transform: {
                x: PADDING,
                y: dims.height - PADDING,
                height: 1,
                width: 1,
                rotation: 270,
              },
            },
          },
        },
      },
    ],
  };
};

export default useCalibrationScene;
