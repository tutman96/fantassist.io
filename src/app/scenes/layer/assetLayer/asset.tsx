/* eslint-disable jsx-a11y/alt-text */
import React, { useEffect, useRef } from "react";
import { Image } from "react-konva";
import Konva from "konva";

import { useAssetElement } from "../../asset";
import TransformableAsset from "./transformableAsset";
import * as Types from "@/protos/scene";

type Props = {
  asset: Types.AssetLayer_Asset;
  onUpdate: (asset: Types.AssetLayer_Asset) => void;
  selected: boolean;
  onSelected: () => void;
  playAudio: boolean;
} & Omit<Konva.ImageConfig, "image">;
const Asset: React.FunctionComponent<Props> = ({
  asset,
  onUpdate,
  selected,
  onSelected,
  playAudio,
  ...rest
}) => {
  const el = useAssetElement(asset);
  const imgRef = useRef<Konva.Image>();

  useEffect(() => {
    if (asset.type === Types.AssetLayer_Asset_AssetType.VIDEO && el) {
      const videoEl = el as HTMLVideoElement;
      videoEl.volume = asset.volume ?? 1;
      videoEl.muted = !playAudio;
      return () => {
        videoEl.muted = true;
      }
    }
  }, [el, asset.type, playAudio, asset.volume])

  useEffect(() => {
    if (el && imgRef.current) {
      el.onload = () => {
        imgRef.current?.getLayer()?.batchDraw();
      };
      if (el.width) {
        imgRef.current?.getLayer()?.batchDraw();
      }
    }
  }, [el, imgRef]);

  const xOffset = asset.calibration
    ? asset.calibration.xOffset / asset.calibration.ppiX
    : 0;
  const yOffset = asset.calibration
    ? asset.calibration.yOffset / asset.calibration.ppiY
    : 0;

  return (
    <TransformableAsset
      isSelected={selected}
      onSelected={onSelected}
      rectTransform={asset.transform!}
      snapOffset={asset.snapToGrid ? { x: xOffset, y: yOffset } : undefined}
      onTransform={(newRect) => {
        asset.transform = newRect;
        onUpdate(asset);
      }}
    >
      <Image
        ref={imgRef as any}
        image={el}
        width={asset.transform!.width}
        height={asset.transform!.height}
        {...rest}
      />
    </TransformableAsset>
  );
};

export default Asset;
