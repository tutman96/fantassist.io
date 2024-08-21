import theme from "@/theme";
import type { Metadata } from "next";
import {ThemeProvider} from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

export const metadata: Metadata = {
  title: "Fantassist",
  description: "Fantassist - Fantasy Map Builder",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider theme={theme}>
          <CssBaseline enableColorScheme />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
