import React, { useState, useRef } from "react";

import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuList from "@mui/material/MenuList";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import ScatterPlotOutlinedIcon from '@mui/icons-material/ScatterPlotOutlined';

import { Layer_LayerType } from "@/protos/scene";
import config from "@/app/config";

type Props = { onAdd: (type: Layer_LayerType) => void };
const AddLayerButton: React.FunctionComponent<Props> = ({ onAdd }) => {
  const [showMenu, setShowMenu] = useState(false);
  const anchorEl = useRef<HTMLElement>();

  const addLayer = (type: Layer_LayerType) => () => {
    setShowMenu(false);
    onAdd(type);
  };

  return (
    <>
      <Tooltip title="Add Layer" placement="top-start">
        <IconButton
          onClick={() => setShowMenu(true)}
          size="small"
          ref={anchorEl as any}
        >
          <AddOutlinedIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl.current}
        open={showMenu}
        onClose={() => setShowMenu(false)}
        elevation={6}
      >
        <MenuList dense disablePadding>
          <MenuItem onClick={addLayer(Layer_LayerType.ASSETS)}>
            <ListItemIcon>
              <ImageOutlinedIcon />
            </ListItemIcon>
            <ListItemText primary="Asset Layer" />
          </MenuItem>
          <MenuItem onClick={addLayer(Layer_LayerType.FOG)}>
            <ListItemIcon>
              <CloudOutlinedIcon />
            </ListItemIcon>
            <ListItemText primary="Fog Layer" />
          </MenuItem>
          {config.enable_markers ? <MenuItem onClick={addLayer(Layer_LayerType.MARKERS)}>
            <ListItemIcon>
              <ScatterPlotOutlinedIcon />
            </ListItemIcon>
            <ListItemText primary="Marker Layer" />
          </MenuItem> : null}
        </MenuList>
      </Menu>
    </>
  );
};
export default AddLayerButton;
