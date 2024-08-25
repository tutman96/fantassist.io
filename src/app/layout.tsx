import theme from "@/theme";
import type { Metadata, Viewport } from "next";
import {ThemeProvider} from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

export const metadata: Metadata = {
  title: "Fantassist",
  description: "Fantasy World Builder",
};

export const viewport: Viewport = {
  userScalable: false,
  colorScheme: "dark",
  themeColor: '#071019',
}

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
