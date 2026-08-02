import type { MetadataRoute } from "next";

export const dynamic = "force-static";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hermes Workspace",
    short_name: "Hermes",
    description: "Hermes Workspace",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#f7f6fb",
    theme_color: "#f7f6fb",
    icons: [{ src: `${basePath}/myosotis-logo.png`, sizes: "1254x1254", type: "image/png" }]
  };
}
