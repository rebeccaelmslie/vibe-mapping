import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Load the monorepo-root .env so NEXT_PUBLIC_* + server vars are available
// without a per-app .env.local.
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) {
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    // ignore
  }
}

const nextConfig: NextConfig = {
  // Compile workspace packages (shared, map-renderer) from source.
  transpilePackages: ['@vibe/shared', '@vibe/map-renderer'],
};

export default nextConfig;
