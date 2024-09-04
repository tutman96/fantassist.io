import React from "react";
import Image from "next/image";

import type { SxProps } from "@mui/material";

import icon from '@/app/icon.png';

const FAVICON_SIZE = 32;

type Props = { active: boolean; sx?: SxProps };
const Favicon: React.FunctionComponent<Props> = ({ active, sx }) => {
  return (
    <Image
      width={FAVICON_SIZE}
      height={FAVICON_SIZE}
      src={icon}
      alt="home icon"
    />
  );
};
export default Favicon;
