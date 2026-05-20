import type { NextConfig } from "next";

const nextConfig = {
  typescript: {
    // IGNORAR temporalmente para descartar si TSC está causando un OOM
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
