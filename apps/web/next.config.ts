import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
