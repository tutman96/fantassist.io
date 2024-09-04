import Box from "@mui/material/Box";
import Image from "next/image";
import Typography from "@mui/material/Typography";

import icon from '@/app/icon.png';

export default function Home() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        textAlign: "center",
      }}
    >
      <Image src={icon} width={200} height={200} alt="logo" priority/>
      <Typography variant="h1">Coming Soon</Typography>
    </Box>
  );
}
