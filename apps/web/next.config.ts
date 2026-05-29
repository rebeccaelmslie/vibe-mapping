import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Compile workspace packages (shared, map-renderer) from source.
  transpilePackages: ['@vibe/shared', '@vibe/map-renderer'],
};

export default nextConfig;
