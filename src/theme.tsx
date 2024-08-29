"use client";
import { createTheme, darken, lighten } from "@mui/material/styles";
import { grey } from "@mui/material/colors";
import { DEEP_SPACE_BLUE, STELLAR_BLUE } from "./colors";

export const SIDEBAR_WIDTH = 48;
export const SCENE_LIST_WIDTH = 240;
export const HEADER_HEIGHT = 64;
export const VISUAL_ASSET_SIZER_SIZE = 650;

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: DEEP_SPACE_BLUE,
      paper: DEEP_SPACE_BLUE,
    },
    primary: {
      main: lighten(STELLAR_BLUE, 0.1),
      dark: darken(STELLAR_BLUE, 0.1),
      light: lighten(STELLAR_BLUE, 0.7),
    },
    secondary: grey,
    error: {
      main: "#db292f",
      dark: "#991c20",
      light: "#e25358",
    },
  },
  shape: {
    borderRadius: 8,
  },
});
export default theme;

export const BACKDROP_STYLE = {
  backgroundColor: theme.palette.background.default,
  boxShadow: theme.shadows[10],
};

