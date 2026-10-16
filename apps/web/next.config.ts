import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output keeps the production container small.
  output: 'standalone',
  // Monorepo: trace files from the workspace root so the standalone build
  // picks up @ecommerce/* correctly.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  images: { unoptimized: true },
  // Ensure Tailwind CSS is processed correctly during development
  compiler: {
    // Remove this if not using Turbopack features
    removeConsole: process.env.NODE_ENV === 'production',
  },
  env: {
    SERVICES_USER_URL: process.env.SERVICES_USER_URL,
    SERVICES_PRODUCT_URL: process.env.SERVICES_PRODUCT_URL,
    SERVICES_ORDER_URL: process.env.SERVICES_ORDER_URL,
    SERVICES_OPS_URL: process.env.SERVICES_OPS_URL,
  },
};

export default nextConfig;
