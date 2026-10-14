import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output keeps the production container small.
  output: 'standalone',
  // Monorepo: trace files from the workspace root so the standalone build
  // picks up @ecommerce/* correctly.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  images: { unoptimized: true },
  env: {
    SERVICES_USER_URL: process.env.SERVICES_USER_URL,
    SERVICES_PRODUCT_URL: process.env.SERVICES_PRODUCT_URL,
    SERVICES_ORDER_URL: process.env.SERVICES_ORDER_URL,
    SERVICES_OPS_URL: process.env.SERVICES_OPS_URL,
  },
};

export default nextConfig;
