import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use Turbopack (default in Next.js 16)
  turbopack: {},
  // Webpack fallback config for pdf.js worker (used if --webpack flag is passed)
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
