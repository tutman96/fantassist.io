import { useEffect, useMemo, useRef, useState } from "react";
import { AssetLayer_Asset, AssetLayer_Asset_AssetType, Scene } from "@/protos/scene";

import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@mui/material/Avatar"

import VolumeUp from '@mui/icons-material/VolumeUp';
import VolumeMute from '@mui/icons-material/VolumeMute';
import { useAssetElementFile } from "./asset";

const AudioItemAvatar: React.FC<{ assetFile: File | null }> = ({ assetFile }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  // Create video element to get video thumbnail
  useEffect(() => {
    if (!assetFile) return;
    const video = document.createElement('video');
    const src = URL.createObjectURL(assetFile);
    video.src = src;
    const canvas = document.createElement('canvas')

    video.onloadeddata = () => {
      video.currentTime = 0;
      video.onseeked = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context?.drawImage(video, 0, 0, canvas.width, canvas.height);
        setThumbnailUrl(canvas.toDataURL());
      }
    }

    return () => {
      URL.revokeObjectURL(src);
    }
  }, [assetFile]);

  if (!thumbnailUrl) {
    return (
      <Avatar variant="rounded">
        <VolumeUp />
      </Avatar>
    )
  }

  return (
    <Avatar src={thumbnailUrl} variant="rounded"/>
  );
}

const AudioItem: React.FC<{ asset: AssetLayer_Asset, updateVolume: (volume: number) => void }> = ({ asset, updateVolume }) => {
  const assetElementFile = useAssetElementFile(asset);
  const muted = (asset.volume ?? 1) == 0;

  // TODO handle assetElementFile === null (missing asset)
  if (assetElementFile === undefined) {
    return null;
  }

  return (
    <ListItem
      secondaryAction={
        <IconButton onClick={() => updateVolume(muted ? 1 : 0)} edge="end">
          {muted ? <VolumeMute /> : <VolumeUp />}
        </IconButton>
      }
      color={assetElementFile ? 'inherit' : 'disabled'}
    >
      <ListItemAvatar>
        <AudioItemAvatar assetFile={assetElementFile} />
      </ListItemAvatar>
      <ListItemText primary={assetElementFile?.name} />
    </ListItem>
  )
}

type Props = { scene: Scene, onUpdate: (scene: Scene) => void };
const AudioButton: React.FC<Props> = ({ scene, onUpdate }) => {
  const [showAudioDropdown, setShowAudioDropdown] = useState(false);
  const anchorEl = useRef<HTMLButtonElement>(null);

  const visibleVideoElements =
    scene.layers
      .filter(layer => layer.assetLayer && layer.assetLayer.visible)
      .map(layer =>
        Object.values(layer.assetLayer!.assets)
          .filter(asset => asset.type === AssetLayer_Asset_AssetType.VIDEO)
      )
      .flat();

  return (
    <>
      <Tooltip title={visibleVideoElements.length > 0 ? "Audio" : "No Assets with Audio"}>
        <span>
          <IconButton size="large" onClick={() => setShowAudioDropdown(true)} ref={anchorEl} disabled={visibleVideoElements.length == 0}>
            <VolumeUp />
          </IconButton>
        </span>
      </Tooltip>
      <Popover
        open={showAudioDropdown}
        onClose={() => setShowAudioDropdown(false)}
        anchorEl={anchorEl.current}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        elevation={9}
        keepMounted
      >
        <List dense sx={{
          width: 400,
        }}>
          {visibleVideoElements.length === 0 && <ListItem>No audio</ListItem>}
          {visibleVideoElements.map(asset => (
            <AudioItem key={asset.id} asset={asset} updateVolume={v => {
              asset.volume = v;
              onUpdate(scene);
            }} />
          ))}
        </List>
      </Popover>
    </>
  );
}
export default AudioButton;
