import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getBaseUrls, fetchJson } from '@/lib/api';
import type { ApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/auth/me → user-service (forwards the session cookie). */
export async function GET(request: NextRequest) {
  const cookie = request.headers.get('cookie');
  try {
    const data = await fetchJson<{ user: { id: string; email: string; role: string } }>(
      `${getBaseUrls().user}/api/auth/me`,
      {
        headers: cookie ? { cookie } : {},
      },
    );
    return NextResponse.json(data);
  } catch (error: unknown) {
    const apiError = error as ApiError | undefined;
    if (apiError?.status === 401) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'The user service is unreachable' } },
      { status: 503 },
    );
  }
}
