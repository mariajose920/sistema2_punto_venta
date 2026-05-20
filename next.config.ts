import type { NextConfig } from "next";

const nextConfig = {
  typescript: {
    // IGNORAR temporalmente para descartar si TSC está causando un OOM
    ignoreBuildErrors: true,
  },
  eslint: {
    // IGNORAR temporalmente para descartar si ESLint está colgando el build
    ignoreDuringBuilds: true,
  }
};

export default nextConfig;
