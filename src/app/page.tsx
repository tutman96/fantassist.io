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
      }}
    >
      <Image src={icon} width={100} height={100} alt="logo" priority/>
      <Typography variant="h2">Coming Soon</Typography>
    </Box>
  );
}
