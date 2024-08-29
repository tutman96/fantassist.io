import theme from "@/theme";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v13-appRouter";
import CssBaseline from "@mui/material/CssBaseline";

import DatadogInit from "@/datadog-init";
import { DEEP_SPACE_BLUE } from "@/colors";

export const metadata: Metadata = {
  title: "Fantassist",
  description: "Fantasy World Builder",
};

export const viewport: Viewport = {
  userScalable: false,
  colorScheme: "dark",
  themeColor: DEEP_SPACE_BLUE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <DatadogInit />
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline enableColorScheme />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
