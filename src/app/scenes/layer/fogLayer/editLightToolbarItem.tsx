import React, { useState, useEffect } from "react";

import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

import SettingsBrightnessOutlinedIcon from "@mui/icons-material/SettingsBrightnessOutlined";

import ToolbarItem from "../toolbarItem";
import InputGroup from "@/partials/inputGroup";
import InputWithUnit from "@/partials/inputWithUnit";
import theme from "@/theme";
import * as Types from "@/protos/scene";
import { MuiColorInput } from "mui-color-input";

const DEFAULT_LIGHT_SOURCES = [
  {
    name: "Torch / Light Spell",
    brightLightDistance: 20 / 5,
    dimLightDistance: 40 / 5,
    color: { r: 255, g: 255, b: 255, a: 255 },
  },
  {
    name: "Lantern",
    brightLightDistance: 30 / 5,
    dimLightDistance: 60 / 5,
    color: { r: 255, g: 255, b: 255, a: 255 },
  },
  {
    name: "Produce Flame Spell",
    brightLightDistance: 10 / 5,
    dimLightDistance: 20 / 5,
    color: { r: 255, g: 167, b: 117, a: 255 },
  },
  {
    name: "Dancing Lights Spell",
    brightLightDistance: 0 / 5,
    dimLightDistance: 10 / 5,
    color: { r: 190, g: 190, b: 255, a: 255 },
  },
  {
    name: "Daylight Spell",
    brightLightDistance: 60 / 5,
    dimLightDistance: 120 / 5,
    color: { r: 200, g: 240, b: 255, a: 255 },
  },
] as Array<Partial<Types.FogLayer_LightSource> & { name: string }>;

function hexToRGBA(hex: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  // Remove the '#' at the start if it's there
  hex = hex.replace(/^#/, "");

  // Parse the values from the hex string
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);
  let a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255; // Default alpha to 255 if not provided

  return { r, g, b, a };
}

type Props = {
  light: Types.FogLayer_LightSource | null;
  onUpdate: (light: Types.FogLayer_LightSource) => void;
};
const EditLightToolbarItem: React.FunctionComponent<Props> = ({
  light,
  onUpdate,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [localLight, setLocalLight] =
    useState<Types.FogLayer_LightSource | null>(light);

  useEffect(() => {
    setLocalLight(light);
  }, [light, setLocalLight]);

  function updateNumberParameter(
    key: string,
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const value = Number(e.target.value);
    if (!isNaN(value)) {
      setLocalLight({
        ...localLight!,
        [key]: value / 5,
      });
    }
  }

  return (
    <>
      <ToolbarItem
        icon={<SettingsBrightnessOutlinedIcon />}
        label="Configure"
        keyboardShortcuts={["r"]}
        disabled={!light}
        onClick={() => setShowModal(true)}
      />
      {localLight && (
        <Dialog
          open={showModal}
          onClose={() => setShowModal(false)}
          title="Configure Light"
        >
          <DialogTitle>Configure Light</DialogTitle>
          <DialogContent>
            <Typography variant="subtitle1">Predefined Lights</Typography>
            <Box
              sx={{
                paddingY: theme.spacing(2),
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              {DEFAULT_LIGHT_SOURCES.map((lightSource) => (
                <Button
                  key={lightSource.name}
                  size="small"
                  variant="outlined"
                  sx={{
                    margin: `0 ${theme.spacing(1)} ${theme.spacing(1)} 0`,
                  }}
                  color={
                    lightSource.brightLightDistance ===
                      localLight.brightLightDistance &&
                    lightSource.dimLightDistance ===
                      localLight.dimLightDistance &&
                    lightSource.color!.r === localLight.color!.r &&
                    lightSource.color!.g === localLight.color!.g &&
                    lightSource.color!.b === localLight.color!.b &&
                    lightSource.color!.a === localLight.color!.a
                      ? "primary"
                      : "secondary"
                  }
                  onClick={() => {
                    setLocalLight({
                      ...localLight,
                      brightLightDistance: lightSource.brightLightDistance!,
                      dimLightDistance: lightSource.dimLightDistance!,
                      color: lightSource.color!,
                    });
                  }}
                >
                  {lightSource.name}
                </Button>
              ))}
            </Box>

            <Typography variant="subtitle1">Parameters</Typography>
            <InputGroup header="Bright Light Distance">
              <InputWithUnit
                type="number"
                unit="ft"
                fullWidth
                value={localLight.brightLightDistance! * 5 + ""}
                onChange={(e) =>
                  updateNumberParameter("brightLightDistance", e)
                }
                inputProps={{ min: 0 }}
              />
            </InputGroup>
            <InputGroup header="Dim Light Distance">
              <InputWithUnit
                type="number"
                unit="ft"
                fullWidth
                value={localLight.dimLightDistance! * 5 + ""}
                onChange={(e) => updateNumberParameter("dimLightDistance", e)}
                inputProps={{ min: 0 }}
              />
            </InputGroup>

            <InputGroup header="Color">
              <MuiColorInput
                variant="outlined"
                size="small"
                fullWidth
                PopoverProps={{
                  elevation: 3,
                  sx: {
                    "& .MuiColorInput-PopoverBody": {
                      padding: 2,
                    },
                  },
                }}
                value={
                  {
                    ...localLight.color!,
                    a: localLight.color!.a / 255,
                  }!
                }
                onChange={(_, colors) => {
                  console.log(hexToRGBA(colors.hex8));
                  setLocalLight({
                    ...localLight,
                    color: hexToRGBA(colors.hex8),
                  });
                }}
              />
            </InputGroup>
          </DialogContent>

          <DialogActions>
            <Button
              onClick={() => {
                onUpdate({ ...localLight });
                setShowModal(false);
              }}
            >
              Save
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
};
export default EditLightToolbarItem;
