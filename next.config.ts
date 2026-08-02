import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  assetPrefix: "./",
  output: "export",
  trailingSlash: true
};

export default nextConfig;
