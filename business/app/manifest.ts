import type { MetadataRoute } from "next"

const ICON =
  "https://seeqjiebmrnolcyydewj.supabase.co/storage/v1/object/public/brand/Easner%20Favicon.svg"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Easner Stablecoin Counter",
    short_name: "Counter",
    description: "Accept stablecoin at the counter — Easner Business",
    start_url: "/pay?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["finance", "business"],
    icons: [
      {
        src: ICON,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: ICON,
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  }
}
