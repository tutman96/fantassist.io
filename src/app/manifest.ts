import type { MetadataRoute } from "next";

import icon from "@/app/icon.png";
import { DEEP_SPACE_BLUE } from "@/colors";

const env = process.env.NEXT_PUBLIC_VERCEL_ENV;

const name = env === "local" ? `Fantassist - Dev` : "Fantassist";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name,
    short_name: name,
    description:
      "Fantassist is a web app built to allow creation and presentation of table-top roleplay map for in person sessions",
    start_url: "/",
    display: "standalone",
    theme_color: DEEP_SPACE_BLUE,
    background_color: DEEP_SPACE_BLUE,
    icons: [
      {
        src: icon.src,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Campaigns",
        short_name: "Campaigns",
        url: "/campaigns",
      },
    ],
  };
}
