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
import { cloneMarker } from "../../marker/storage";
import MarkerList, { DROP_DATA_TYPE } from "../../marker/markerList";
import LayerListTopperPortal from "../../canvas/layerListTopperProvider";
import { useStageClick } from "@/utils";
import { useConnection, useConnectionState, useTrackerMarkerLocations } from "@/external/hooks";
import { ChannelState } from "@/external/abstractChannel";
import MarkerPlaceholder from "./markerPlaceholder";

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
  const connection = useConnection();
  const trackerConnectionState = useConnectionState(connection.trackerChannel);

  useStageClick(groupRef.current, () => {
    setSelectedMarkerId(null);
  });

  useEffect(() => {
    if (!groupRef.current || !campaignId || !layerActive) return;
    const parent = groupRef.current.getStage()!;

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
      marker.asset!.transform!.x = Math.floor(position.x);
      marker.asset!.transform!.y = Math.floor(position.y);

      layer.markers.push(marker);
      layer.markers = Array.from(layer.markers);
      setSelectedMarkerId(marker.id);
      onUpdate(layer);
    }

    // This is to allow the drop
    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer) return;
      e.preventDefault();
    }
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);

    return () => {
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("drop", onDrop);
    };
  }, [layer, layerActive, campaignId, groupRef, selectedMarkerId, onUpdate]);

  useEffect(() => {
    if (trackerConnectionState !== ChannelState.CONNECTED) return;

    connection.trackerChannel.request({
      trackerStartTrackingRequest: {
        updateRateMs: 1000 / 10,
      },
    });

    return () => {
      connection.trackerChannel.request({
        trackerSetIdleRequest: {},
      })
    };
  }, [trackerConnectionState])

  const trackerMarkerLocations = useTrackerMarkerLocations();

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
              cornerRadius={m.asset!.transform!.width / 2}
              shadowColor="rgba(0,0,0,1)"
              shadowBlur={0.2}
            />
          );
        })}
        {trackerConnectionState === ChannelState.CONNECTED && Object.entries(trackerMarkerLocations).map(([id, markerLocation]) => {
          return (
            <MarkerPlaceholder
              key={id}
              id={+id}
              location={markerLocation}
            />
          );
        })
        }
      </Group>
    </>
  );
};
export default MarkerLayer;
