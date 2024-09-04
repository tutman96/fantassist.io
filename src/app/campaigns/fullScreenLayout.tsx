import { PropsWithChildren } from "react";
import Link from "next/link";
import Image from "next/image";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

import theme from "@/theme";

import iconHorizontal from './icon-horizontal.png';

type Props = {
  loadingText?: string | null;
  extraTitleItems?: React.ReactNode;
} & PropsWithChildren;
const Layout: React.FC<Props> = ({
  children,
  loadingText,
  extraTitleItems,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100vh",
      }}
    >
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          alignContent: "center",
          padding: "1rem 1rem",
          height: "64px",
        }}
      >
        <Box sx={{ paddingRight: theme.spacing(2) }}>
          <Link href="/campaigns" passHref>
            <Image
              src={iconHorizontal}
              height={64 / 2}
              alt="Fantassist Icon"
              priority
            />
          </Link>
        </Box>
        {extraTitleItems}
      </Box>
      <Box
        sx={{
          flex: "2",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "center",
          height: "100%",
          paddingX: theme.spacing(2),
        }}
      >
        {loadingText && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Typography sx={{ marginBottom: theme.spacing(2) }}>
              {loadingText}
            </Typography>
            <CircularProgress color="secondary" value={50} />
          </Box>
        )}
        {!loadingText && children}
      </Box>
    </Box>
  );
};
export default Layout;
