import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Optimizaciones de imágenes para PWA
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // Soporte para PWA
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
