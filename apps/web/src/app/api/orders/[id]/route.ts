import { getBaseUrls, proxyToService } from '@/lib/api';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/orders/:id → order service. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const target = `${getBaseUrls().order}/api/orders/${encodeURIComponent(id)}`;
  return proxyToService(request, target, 'The order service');
}
