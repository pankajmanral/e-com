import type { NextRequest } from 'next/server';
import { getBaseUrls, proxyToService } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** POST /api/orders → order service (creates an order). */
export async function POST(request: NextRequest) {
  return proxyToService(request, `${getBaseUrls().order}/api/orders`, 'The order service');
}
