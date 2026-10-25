import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** POST /api/auth/register → user-service. */
export async function POST(request: NextRequest) {
  const body = await request.text();
  try {
    const response = await fetch(`${process.env.SERVICES_USER_URL ?? 'http://localhost:4001'}/api/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') as string } : {}),
      },
      body,
      cache: 'no-store',
    });

    const text = await response.text();
    const nextResponse = new NextResponse(text, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      nextResponse.headers.set('set-cookie', setCookie);
    }

    return nextResponse;
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'The user service is unreachable' } },
      { status: 503 },
    );
  }
}
