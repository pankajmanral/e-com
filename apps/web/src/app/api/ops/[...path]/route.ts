import { getBaseUrls, proxyToService } from '@/lib/api';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Catch-all proxy for the ops service: forwards GET/POST/DELETE (including
 * the query string) to SERVICES_OPS_URL + /api/ops/<path segments>.
 *
 * Covers /health, /status, /metrics, /metrics/history, /snapshots,
 * /compare/:before/:after, /chaos, /chaos/:id, /chaos/:id/stop.
 */
export async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const query = request.nextUrl.searchParams.toString();
  const suffix = path.map(encodeURIComponent).join('/');
  const target = `${getBaseUrls().ops}/api/ops/${suffix}${query ? `?${query}` : ''}`;
  return proxyToService(request, target, 'The ops service');
}

export const GET = forward;
export const POST = forward;
export const DELETE = forward;
