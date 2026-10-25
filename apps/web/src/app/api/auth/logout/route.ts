import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** POST /api/auth/logout → user-service (clears the session cookie). */
export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${process.env.SERVICES_USER_URL ?? 'http://localhost:4001'}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') as string } : {}),
      },
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
    return NextResponse.json({ ok: true });
  }
}
