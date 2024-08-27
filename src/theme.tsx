'use client';
import {singletonHook} from 'react-singleton-hook';
import {createTheme, darken, lighten} from '@mui/material/styles';
import {useState} from 'react';
import {grey} from '@mui/material/colors';

export const SIDEBAR_WIDTH = 48;
export const SCENE_LIST_WIDTH = 240;
export const HEADER_HEIGHT = 64;
export const VISUAL_ASSET_SIZER_SIZE = 650;

export const useSceneSidebarOpen = singletonHook([true, () => {}], () =>
  useState<boolean>(true)
);

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: darken('#0D1B2A', 0.4),
      paper: '#0D1B2A',
    },
    primary: {
      main: lighten('#1E90FF', 0.5),
      dark: '#1E90FF',
      light: lighten('#1E90FF', 0.7)
    },
    secondary: grey,
    error: {
      main: '#db292f',
      dark: '#991c20',
      light: '#e25358',
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

export const COSMIC_PURPLE = '#3A0CA3';
