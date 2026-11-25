import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  devIndicators: false,
  webpack(config, { dev }) {
    // Release exports must include the latest local CSS rather than a stale
    // filesystem cache snapshot on this Windows workspace.
    if (!dev) config.cache = false;
    return config;
  },
};

export default nextConfig;
