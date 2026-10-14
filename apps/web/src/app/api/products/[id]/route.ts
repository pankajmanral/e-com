import { getBaseUrls, proxyToService } from '@/lib/api';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/products/:id (id or slug) → product service. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const target = `${getBaseUrls().product}/api/products/${encodeURIComponent(id)}`;
  return proxyToService(request, target, 'The product service');
}
