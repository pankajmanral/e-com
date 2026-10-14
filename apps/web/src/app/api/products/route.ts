import type { NextRequest } from 'next/server';
import { getBaseUrls, proxyToService } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/products?search=&category=&sort=&page=&perPage= → product service. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const target = `${getBaseUrls().product}/api/products${query ? `?${query}` : ''}`;
  return proxyToService(request, target, 'The product service');
}
