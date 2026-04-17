import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/favicon.ico',
        destination: '/icon',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
