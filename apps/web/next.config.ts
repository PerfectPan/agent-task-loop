import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo: pin the tracing root to the repo root (this app lives in apps/web).
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};

export default nextConfig;
