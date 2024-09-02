import { markerStorage } from "./storage";
import { darken } from "@mui/material/styles";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardActions from "@mui/material/CardActions";
import ImageList from "@mui/material/ImageList";
import ImageListItem from "@mui/material/ImageListItem";
import IconButton from "@mui/material/IconButton";

import ScatterPlotOutlinedIcon from "@mui/icons-material/ScatterPlotOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import PanToolOutlinedIcon from "@mui/icons-material/PanToolOutlined";
import Add from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";

import theme from "@/theme";
import { Marker } from "@/protos/scene";
import { getNewAssets, useAssetElementSrc } from "../asset";
import { useRef, useState } from "react";

export const DROP_DATA_TYPE = "application/fantassist-marker";

const MarkerListItem: React.FC<{
  marker: Marker;
  selected: boolean;
  onSelect: () => void;
}> = ({ marker, selected, onSelect }) => {
  const src = useAssetElementSrc(marker.asset!);
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <ImageListItem
      sx={{
        cursor: "grab",
        border: selected
          ? `2px solid ${theme.palette.primary.main}`
          : "2px solid transparent",
        "&:not(.dragging):hover > .MuiBox-root": {
          display: "flex",
        },
        borderRadius: '50%',
        boxShadow: theme.shadows[5],
        overflow: 'hidden',
      }}
      onDragStart={(e) => {
        e.dataTransfer!.effectAllowed = "copy";
        e.dataTransfer!.setData(DROP_DATA_TYPE, marker.id);
        (e.target as HTMLDivElement).classList.add("dragging");
      }}
      onDragEnd={(e) => {
        (e.target as HTMLDivElement).classList.remove("dragging");
      }}
      draggable
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img ref={imgRef} src={src} alt={`marker-${marker.id}`} />}
      <Box
        sx={{
          display: "none",
          background: "rgba(0, 0, 0, 0.5)",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PanToolOutlinedIcon fontSize="large" />
      </Box>
    </ImageListItem>
  );
};

type Props = {
  campaignId: string;
};
const MarkerList: React.FC<Props> = ({ campaignId }) => {
  const markers = markerStorage.useAllValues(`${campaignId}/`);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  
  return (
    <Card
      sx={{
        boxShadow: theme.shadows[10],
        backgroundColor: darken(theme.palette.background.paper, 0.1),
        height: "100%",
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
      }}
      onClick={() => setSelectedMarkerId(null)}
    >
      <CardHeader
        title="Markers"
        avatar={<ScatterPlotOutlinedIcon />}
        sx={{
          paddingY: theme.spacing(1.5),
        }}
      />
      <Box
        sx={{
          overflow: "auto",
          backgroundColor: darken(theme.palette.background.paper, 0.2),
        }}
      >
        {markers && markers.size > 0 && (
          <ImageList
            cols={3}
            gap={4}
            sx={{
              paddingX: theme.spacing(1),
            }}
          >
            {Array.from(markers.values())
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((marker) => (
                <MarkerListItem
                  key={marker.id}
                  marker={marker}
                  selected={selectedMarkerId === marker.id}
                  onSelect={() => setSelectedMarkerId(marker.id)}
                />
              ))}
          </ImageList>
        )}
        {markers && markers.size === 0 && (
          <Box
            sx={{
              textAlign: "center",
              paddingY: theme.spacing(5),
              color: theme.palette.text.secondary,
            }}
          >
            No markers
          </Box>
        )}
      </Box>
      <CardActions
        sx={{
          paddingY: theme.spacing(1),
          justifyContent: "flex-end",
        }}
      >
        <IconButton
          size="small"
          color="error"
          disabled={selectedMarkerId === null}
          onClick={async () => {
            if (selectedMarkerId === null) return;
            await markerStorage.deleteItem(selectedMarkerId);
            setSelectedMarkerId(null);
          }}
        >
          <DeleteOutlinedIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton
          size="small"
          onClick={async () => {
            const assets = await getNewAssets(campaignId!);
            let offset = 0;
            for (const asset of assets) {
              const aspectRatio = asset.size!.width / asset.size!.height;
              asset.transform!.height = 1;
              asset.transform!.width = asset.transform!.height * aspectRatio;
              asset.transform!.x = offset++;
              asset.transform!.y = 0;

              const marker = {
                id: asset.id,
                asset: asset,
              } as Marker;
              await markerStorage.createItem(marker.id, marker);
            }
          }}
        >
          <Add />
        </IconButton>
      </CardActions>
    </Card>
  );
};
export default MarkerList;
