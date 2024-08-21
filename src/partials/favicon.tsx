import React from "react";

import Box from "@mui/material/Box";
import type { SxProps } from "@mui/material";

import { theme } from "../theme";
import Image from "next/image";

import favicon from './assets/favicon.png';
import faviconOutlined from './assets/favicon-outlined.png';

const transition = theme.transitions.create("opacity");
const FAVICON_SIZE = 32;

type Props = { active: boolean; sx?: SxProps };
const Favicon: React.FunctionComponent<Props> = ({ active, sx }) => {
  return (
    <Box
      sx={{
        ...sx,
        width: FAVICON_SIZE,
        height: FAVICON_SIZE,
      }}
    >
      <Image
        width={FAVICON_SIZE}
        height={FAVICON_SIZE}
        src={favicon}
        alt="home icon"
        style={{
          transition,
          opacity: active ? 1 : 0,
          position: "relative",
        }}
      />
      <Image
        width={FAVICON_SIZE}
        height={FAVICON_SIZE}
        src={faviconOutlined}
        alt="home icon"
        style={{
          transition,
          opacity: active ? 0 : 1,
          position: "relative",
          top: -38, // Magic Number
        }}
      />
    </Box>
  );
};
export default Favicon;
