import { PropsWithChildren } from "react";
import Box from "@mui/material/Box";
import Image from "next/image";
import theme from "@/theme";

import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { padding } from "@mui/system";
import CampaignSelector from "./campaignSelector";
import Link from "next/link";

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
              src="/icon-horizontal.png"
              height={64 / 2}
              width={385 / 2}
              alt="Fantassist Icon"
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
