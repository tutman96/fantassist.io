import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fantassist",
    short_name: "Fantassist",
    description:
      "Fantassist is a web app built to allow creation and presentation of table-top roleplay map for in person sessions",
    start_url: "/",
    display: "standalone",
    theme_color: "#0D1B2A",
    background_color: "#071019",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
