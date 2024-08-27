import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Group } from "react-konva";
import Konva from "konva";

import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import GridGoldenratioOutlinedIcon from "@mui/icons-material/GridGoldenratioOutlined";
import Grid3x3OutlinedIcon from "@mui/icons-material/Grid3x3Outlined";

import { ILayerComponentProps } from "..";
import AssetComponent from "./asset";
import { deleteAsset, getNewAssets } from "../../asset";
import ToolbarItem, { ToolbarSeparator } from "../toolbarItem";
import ToolbarPortal from "../toolbarPortal";
import AssetSizer, { calculateCalibratedTransform } from "./assetSizer";
import { usePlayAudioOnTable } from "../../../settings";
import {
  calculateViewportCenter,
  calculateViewportDimensions,
} from "../../canvas";
import * as Types from "@/protos/scene";
import { useCampaignId } from "@/app/campaigns/hooks";

type Props = ILayerComponentProps<Types.AssetLayer>;
const AssetLayer: React.FunctionComponent<Props> = ({
  layer,
  onUpdate,
  active: layerActive,
  isTable,
}) => {
  const campaignId = useCampaignId();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const groupRef = useRef<Konva.Group>();
  const [playAudioOnTable] = usePlayAudioOnTable();

  const deleteSelectedAsset = useCallback(async () => {
    if (selectedAssetId && layer.assets[selectedAssetId]) {
      const asset = layer.assets[selectedAssetId];
      delete layer.assets[selectedAssetId];
      await deleteAsset(asset);
      layer.assets = { ...layer.assets };
      onUpdate(layer);
      setSelectedAssetId(null);
    }
  }, [selectedAssetId, layer, onUpdate, setSelectedAssetId]);

  // Animate the layer if there are any video assets
  useEffect(() => {
    if (!groupRef.current) return;
    if (
      !Object.values(layer.assets).some(
        (asset) => asset.type === Types.AssetLayer_Asset_AssetType.VIDEO
      )
    )
      return;

    let previousUpdate = Date.now();
    const anim = new Konva.Animation(() => {
      const now = Date.now();
      // 10 FPS cap on DM display
      if (!isTable && now - previousUpdate < 100) return false;
      else previousUpdate = now;
      return true;
    }, groupRef.current);
    anim.start();
    return () => {
      anim.stop();
    };
  }, [groupRef, layer.assets, isTable]);

  useEffect(() => {
    if (!groupRef.current?.parent) return;
    const parent = groupRef.current.getStage()!;

    function onParentClick() {
      if (selectedAssetId) {
        setSelectedAssetId(null);
      }
    }
    parent.on("click.konva", onParentClick);
    return () => {
      parent.off("click.konva", onParentClick);
    };
  }, [groupRef, selectedAssetId]);

  // Reset selected asset when active layer changes
  useEffect(() => {
    if (!layerActive && selectedAssetId !== null) {
      setSelectedAssetId(null);
    }
  }, [layerActive, selectedAssetId]);

  const toolbar = useMemo(() => {
    const selectedAsset = selectedAssetId
      ? layer.assets[selectedAssetId]
      : undefined;
    return (
      <>
        <ToolbarItem
          icon={<AddPhotoAlternateOutlinedIcon />}
          label="Add Asset"
          onClick={async () => {
            const assets = await getNewAssets(campaignId!);
            const stage = groupRef.current!.getStage()!;
            const viewportCenter = calculateViewportCenter(stage);
            const viewportDimensions = calculateViewportDimensions(stage);
            for (const asset of assets) {
              const aspectRatio = asset.size!.width / asset.size!.height;
              asset.transform!.height = viewportDimensions.height / 2;
              asset.transform!.width = asset.transform!.height * aspectRatio;
              asset.transform!.x =
                viewportCenter.x - (asset.transform!.width ?? 0) / 2;
              asset.transform!.y =
                viewportCenter.y - (asset.transform!.height ?? 0) / 2;
              layer.assets[asset.id] = asset;
            }
            layer.assets = { ...layer.assets };
            onUpdate(layer);
          }}
        />
        <ToolbarSeparator />
        <AssetSizer
          asset={selectedAsset}
          onUpdate={(asset) => {
            asset.transform = calculateCalibratedTransform(asset);
            layer.assets[asset.id] = asset;
            onUpdate(layer);
          }}
        />
        <ToolbarItem
          label={selectedAsset?.snapToGrid ? "Free Move" : "Snap to Grid"}
          disabled={!selectedAsset}
          icon={
            selectedAsset?.snapToGrid ? (
              <Grid3x3OutlinedIcon />
            ) : (
              <GridGoldenratioOutlinedIcon />
            )
          }
          onClick={() => {
            if (!selectedAsset) return;
            selectedAsset.snapToGrid = !selectedAsset.snapToGrid;
            onUpdate(layer);
          }}
        />
        <ToolbarSeparator />
        <ToolbarItem
          icon={<DeleteOutlinedIcon />}
          label="Delete Asset"
          disabled={selectedAssetId === null}
          onClick={deleteSelectedAsset}
          keyboardShortcuts={["Delete", "Backspace"]}
        />
      </>
    );
  }, [layer, groupRef, selectedAssetId, onUpdate, deleteSelectedAsset]);
  return (
    <>
      {layerActive && <ToolbarPortal>{toolbar}</ToolbarPortal>}
      <Group ref={groupRef as any} listening={layerActive}>
        {Object.values(layer.assets).map((asset) => {
          return (
            <AssetComponent
              key={asset.id}
              asset={asset}
              selected={layerActive && selectedAssetId === asset.id}
              onSelected={() => layerActive && setSelectedAssetId(asset.id)}
              onUpdate={(updatedAsset) => {
                layer.assets[updatedAsset.id] = updatedAsset;
                onUpdate(layer);
              }}
              playAudio={isTable && !!playAudioOnTable}
            />
          );
        })}
      </Group>
    </>
  );
};
export default AssetLayer;
