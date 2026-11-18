// Web app manifest: lets phones install CrowdMap to the home screen and open
// it full screen like an app.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CrowdMap: live crowd levels",
    short_name: "CrowdMap",
    description: "See how crowded temples, markets, restaurants and more are before you go, and when they're quiet.",
    lang: "en-IN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    categories: ["navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
