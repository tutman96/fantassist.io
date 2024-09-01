import React, { useEffect, useMemo, useRef, useState } from "react";
import { Group } from "react-konva";

import { ILayerComponentProps } from "..";
import ToolbarPortal from "../toolbarPortal";

import * as Types from "@/protos/scene";
import { useCampaignId } from "@/app/campaigns/hooks";
import ToolbarItem, { ToolbarSeparator } from "../toolbarItem";

import Grid3x3OutlinedIcon from "@mui/icons-material/Grid3x3Outlined";
import GridGoldenratioOutlinedIcon from "@mui/icons-material/GridGoldenratioOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";

import AssetComponent from "../assetLayer/asset";
import Konva from "konva";
import { cloneMarker, markerStorage } from "../../marker/storage";
import MarkerList, { DROP_DATA_TYPE } from "../../marker/markerList";
import LayerListTopperPortal from "../../canvas/layerListTopperProvider";

type Props = ILayerComponentProps<Types.MarkerLayer>;
const MarkerLayer: React.FunctionComponent<Props> = ({
  layer,
  onUpdate,
  active: layerActive,
  isTable,
}) => {
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const campaignId = useCampaignId();
  const groupRef = useRef<Konva.Group>();

  useEffect(() => {
    if (!groupRef.current || !campaignId || !layerActive) return;
    const parent = groupRef.current.getStage()!;

    function onParentClick() {
      if (selectedMarkerId) {
        setSelectedMarkerId(null);
      }
    }
    parent.on("click.konva", onParentClick);

    const container = parent.container();

    async function onDrop(e: DragEvent) {
      e.preventDefault();
      if (!e.dataTransfer) return; // TODO: handle raw image drops?

      const markerId = e.dataTransfer.getData(DROP_DATA_TYPE);
      if (!markerId) return;

      const marker = await cloneMarker(campaignId!, markerId);

      parent.setPointersPositions(e);
      const position = parent.getRelativePointerPosition()!;

      // put the center of the marker at the pointer position

      marker.asset!.snapToGrid = true;
      marker.asset!.transform!.x = Math.floor(
        position.x - marker.asset!.transform!.width / 2
      );
      marker.asset!.transform!.y = Math.floor(
        position.y - marker.asset!.transform!.height / 2
      );

      layer.markers.push(marker);
      layer.markers = Array.from(layer.markers);
      setSelectedMarkerId(marker.id);
      onUpdate(layer);
    }
    container.addEventListener("drop", onDrop);

    return () => {
      parent.off("click.konva", onParentClick);
      container.removeEventListener("drop", onDrop);
    };
  }, [layer, layerActive, campaignId, groupRef, selectedMarkerId, onUpdate]);

  const toolbar = useMemo(() => {
    const selectedAsset = selectedMarkerId
      ? layer.markers.find((m) => m.id === selectedMarkerId)
      : undefined;
    return (
      <>
        <ToolbarItem
          label={
            selectedAsset?.asset!.snapToGrid ? "Free Move" : "Snap to Grid"
          }
          disabled={!selectedAsset}
          icon={
            selectedAsset?.asset!.snapToGrid ? (
              <Grid3x3OutlinedIcon />
            ) : (
              <GridGoldenratioOutlinedIcon />
            )
          }
          onClick={() => {
            if (!selectedAsset) return;
            selectedAsset.asset!.snapToGrid = !selectedAsset.asset!.snapToGrid;
            onUpdate(layer);
          }}
        />
        <ToolbarSeparator />
        <ToolbarItem
          icon={<DeleteOutlinedIcon />}
          label="Delete Marker"
          disabled={selectedMarkerId === null}
          onClick={() => {
            const i = layer.markers.findIndex((m) => m.id === selectedMarkerId);
            if (i === -1) return;
            layer.markers.splice(i, 1);
            layer.markers = Array.from(layer.markers);
            setSelectedMarkerId(null);
            onUpdate(layer);
          }}
          keyboardShortcuts={["Delete", "Backspace"]}
        />
      </>
    );
  }, [layer, selectedMarkerId, onUpdate]);
  return (
    <>
      {layerActive && <ToolbarPortal>{toolbar}</ToolbarPortal>}
      {layerActive && (
        <LayerListTopperPortal>
          <MarkerList campaignId={campaignId!} />
        </LayerListTopperPortal>
      )}
      <Group listening={layerActive} ref={groupRef as any}>
        {layer.markers.map((m) => {
          return (
            <AssetComponent
              key={m.id}
              asset={m.asset!}
              selected={layerActive && selectedMarkerId === m.id}
              onSelected={() => setSelectedMarkerId(m.id)}
              onUpdate={(updatedAsset) => {
                m.asset = updatedAsset;
                // layer.markers = Array.from(layer.markers);
                onUpdate(layer);
              }}
              playAudio={false}
            />
          );
        })}
      </Group>
    </>
  );
};
export default MarkerLayer;
