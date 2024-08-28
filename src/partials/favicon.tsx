import React from "react";

import type { SxProps } from "@mui/material";

import Image from "next/image";

const FAVICON_SIZE = 32;

type Props = { active: boolean; sx?: SxProps };
const Favicon: React.FunctionComponent<Props> = ({ active, sx }) => {
  return (
    <Image
      width={FAVICON_SIZE}
      height={FAVICON_SIZE}
      src="/icon.png"
      alt="home icon"
    />
  );
};
export default Favicon;
