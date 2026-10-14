import type { NextRequest } from 'next/server';
import { getBaseUrls, proxyToService } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/categories → product service. */
export async function GET(request: NextRequest) {
  return proxyToService(request, `${getBaseUrls().product}/api/categories`, 'The product service');
}
