"use client";
import Box from "@mui/material/Box";
import { darken, alpha } from "@mui/material/styles";
import Image from "next/image";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

import icon from '@/app/icon-full-dark.png';
import { COSMIC_PURPLE, DEEP_SPACE_BLUE, NEBULA_PINK, STELLAR_BLUE } from "@/colors";
import theme from "@/theme";
import Link from "next/link";

export default function Home() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        textAlign: "center",
        background: `linear-gradient(to top right, ${darken(STELLAR_BLUE, 0.2)} -10%, ${darken(COSMIC_PURPLE, 0.2)} 70%, ${darken(NEBULA_PINK, 0.2)} 120%)`,
        paddingX: theme.spacing(4),
        paddingY: theme.spacing(8),
      }}
    >
      <Box sx={{
        marginY: 4,
        display: "flex",
        flexDirection: "row",
        maxWidth: 1200,
        width: "100%",
        height: "100%",
        maxHeight: 600,
        background: alpha(darken(DEEP_SPACE_BLUE, 0.5), 0.7),
        borderRadius: theme.shape.borderRadius / 2,
        boxShadow: theme.shadows[24],
        overflow: "hidden",
      }}>
        <Box sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "left",
          padding: theme.spacing(4),
        }}>
          <Box sx={{
            maxWidth: 600
          }}>
            <Image src={icon} height={300} alt="logo" priority />
          </Box>
        </Box>
        <Box sx={{
          maxWidth: 600,
          background: 'rgba(0,0,0,0.2)',
          height: "100%",
          padding: theme.spacing(8),
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-around",
          textAlign: "left",
        }}>
          <Box>
            <Typography variant="h4">Welcome to Fantassist</Typography>

            <Typography variant="body1" sx={{ marginTop: 2, opacity: 0.8 }}>
              Fantassist is a web app built to allow creation and presentation of table-top roleplay map for in person sessions
            </Typography>
          </Box>

          <Button fullWidth variant="contained" color="primary" size="large" href="/campaigns" LinkComponent={Link}>
            Start Building
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
