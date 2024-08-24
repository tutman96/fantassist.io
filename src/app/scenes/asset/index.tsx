import { useState, useEffect, useMemo, useRef } from "react";
import { v4 } from "uuid";

import { getImageSize, getVideoSize } from "./assetSize";
import { assetFileDatabase } from "./storage";
import * as Types from "@/protos/scene";
import { useConnection, useConnectionState } from "@/external/hooks";
import { ChannelState } from "@/external/abstractChannel";

export const { storage: fileStorage, useOneValue } = assetFileDatabase();

export function getNewAssets() {
  const fileDialogInput = document.createElement("input");
  fileDialogInput.type = "file";
  fileDialogInput.multiple = true;
  fileDialogInput.accept = "image/*,video/*";

  fileDialogInput.click();
  return new Promise<Array<Types.AssetLayer_Asset>>((res) => {
    fileDialogInput.onchange = async (e) => {
      const files = (e!.target as HTMLInputElement).files;
      if (!files) {
        return;
      }

      const assets = new Array<Types.AssetLayer_Asset>();
      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) continue;

        assets.push(await createAsset(file));
      }
      res(assets);
    };
  });
}

export async function createAsset(file: File) {
  const asset = {
    id: v4(),
    type: Types.AssetLayer_Asset_AssetType.IMAGE,
    transform: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
    },
  } as Types.AssetLayer_Asset;

  let res: { width: number; height: number };
  if (file.type.indexOf("image") === 0) {
    res = await getImageSize(file);
    asset.type = Types.AssetLayer_Asset_AssetType.IMAGE;
  } else if (file.type.indexOf("video") === 0) {
    res = await getVideoSize(file);
    asset.type = Types.AssetLayer_Asset_AssetType.VIDEO;
  } else {
    throw new Error("Unknown file type");
  }

  asset.size = {
    width: res.width,
    height: res.height,
  };
  asset.transform!.width = res.width;
  asset.transform!.height = res.height;

  await fileStorage.setItem(asset.id, file);
  return asset;
}

export async function deleteAsset(asset: Types.AssetLayer_Asset) {
  console.log("Deleting asset " + asset.id);
  await fileStorage.removeItem(asset.id);
}

export function useAssetElement(asset: Types.AssetLayer_Asset) {
  const [file, setFile] = useOneValue(asset.id);

  const connection = useConnection();
  const connectionState = useConnectionState();

  const elementRef = useRef<HTMLImageElement | HTMLVideoElement | null>(
    document.createElement(
      asset.type === Types.AssetLayer_Asset_AssetType.IMAGE ? "img" : "video"
    )
  );

  useEffect(() => {
    if (
      file === null &&
      connection &&
      connectionState === ChannelState.CONNECTED
    ) {
      connection
        .request({
          getAssetRequest: {
            id: asset.id,
          },
        })
        .then((response) => {
          setFile(new File([response.getAssetResponse!.payload], asset.id));
        });
    }

    if (file && elementRef.current) {
      elementRef.current.src = URL.createObjectURL(file);

      if (asset.type === Types.AssetLayer_Asset_AssetType.VIDEO) {
        const video = elementRef.current as HTMLVideoElement;
        video.loop = true;
        video.muted = true;
        video.autoplay = true;
        video.play();
      }

      return () => {
        URL.revokeObjectURL(elementRef.current!.src);
      }
    }
  }, [connection, connectionState, file, asset.id, setFile]);

  return elementRef.current;
}
