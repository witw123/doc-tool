import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@doc-tool/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_BACKEND_URL || 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
