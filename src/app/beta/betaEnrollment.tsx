"use client";

import Link from "next/link";

import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, darken } from "@mui/material/styles";

import { COSMIC_PURPLE, NEBULA_PINK, STELLAR_BLUE } from "@/colors";
import theme from "@/theme";

import { VersionSwitchButton } from "./versionSwitch";

export default function BetaEnrollment({
  enrolled,
  betaAvailable,
}: {
  enrolled: boolean;
  betaAvailable: boolean;
}) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: { xs: 2, sm: 4 },
        background: `radial-gradient(circle at 20% 10%, ${alpha(
          NEBULA_PINK,
          0.2
        )}, transparent 35%), linear-gradient(145deg, ${darken(
          STELLAR_BLUE,
          0.55
        )}, ${darken(COSMIC_PURPLE, 0.55)})`,
      }}
    >
      <Paper
        elevation={24}
        sx={{
          width: "100%",
          maxWidth: 760,
          padding: { xs: 3, sm: 6 },
          border: `1px solid ${alpha(NEBULA_PINK, 0.25)}`,
          background: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: "blur(24px)",
        }}
      >
        <Stack spacing={4}>
          <Stack direction="row" justifyContent="space-between" spacing={2}>
            <Box>
              <Chip
                icon={<ScienceOutlined />}
                label="Fantassist Beta"
                color="primary"
                variant="outlined"
                sx={{ marginBottom: 2 }}
              />
              <Typography variant="h3" component="h1" gutterBottom>
                Help shape the new table experience
              </Typography>
              <Typography color="text.secondary" variant="h6">
                Opt in once and Fantassist will open the beta on this device when
                it is available.
              </Typography>
            </Box>
            <AutoAwesomeOutlined
              sx={{
                display: { xs: "none", sm: "block" },
                fontSize: 72,
                color: NEBULA_PINK,
              }}
            />
          </Stack>

          <Stack spacing={1.5}>
            {[
              "Your campaigns, scenes, and assets stay in this browser.",
              "You can return to the stable version at any time.",
              "Launching another version closes the active table display safely.",
            ].map((text) => (
              <Stack key={text} direction="row" spacing={1.5} alignItems="center">
                <CheckCircleOutline color="primary" />
                <Typography>{text}</Typography>
              </Stack>
            ))}
          </Stack>

          <Box
            sx={{
              padding: 2.5,
              borderRadius: 1,
              background: alpha(STELLAR_BLUE, 0.08),
              border: `1px solid ${alpha(STELLAR_BLUE, 0.2)}`,
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {enrolled ? "Beta preference saved" : "Stable version selected"}
            </Typography>
            <Typography color="text.secondary">
              {enrolled
                ? betaAvailable
                  ? "Continue to Fantassist to load the beta experience."
                  : "The preference is saved. Stable Fantassist will continue to load until the beta deployment is connected."
                : "Fantassist currently opens the stable experience on this device."}
            </Typography>
          </Box>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ sm: "center" }}
          >
            {enrolled ? (
              <VersionSwitchButton version="stable">
                Return to stable
              </VersionSwitchButton>
            ) : (
              <VersionSwitchButton version="beta">
                Opt in to beta
              </VersionSwitchButton>
            )}
            <Button
              component={Link}
              href="/campaigns"
              variant="text"
              color="secondary"
              startIcon={<ArrowBackOutlined />}
            >
              Continue without changing
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
