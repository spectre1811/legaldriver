import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

// PWA manifest — brand mark (WO-05). Icons live in /public/icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name} — ${brand.tagline.replace(/\.$/, "")}`,
    short_name: brand.name,
    description:
      "Track court cases by CNR, your cause list and deadlines, notices, billing and client communication — in English and हिन्दी.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FAF7F1",
    theme_color: "#191926",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
