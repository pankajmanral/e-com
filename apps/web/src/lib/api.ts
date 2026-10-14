/**
 * Server-side API helpers. The browser never talks to the services directly —
 * route handlers in src/app/api proxy to them, and server components use these
 * helpers to fetch during render (always no-store).
 */

import { NextResponse } from 'next/server';

export interface BaseUrls {
  user: string;
  product: string;
  order: string;
  ops: string;
}

/** Resolve service base URLs from the environment with safe defaults. */
export function getBaseUrls(): BaseUrls {
  return {
    user: process.env.SERVICES_USER_URL ?? 'http://localhost:4001',
    product: process.env.SERVICES_PRODUCT_URL ?? 'http://localhost:4002',
    order: process.env.SERVICES_ORDER_URL ?? 'http://localhost:4003',
    ops: process.env.SERVICES_OPS_URL ?? 'http://localhost:4004',
  };
}

export type ServiceKey = keyof BaseUrls;

/** Error thrown for any failed backend call (network or HTTP error). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Array<{ field: string; message: string }>;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field: string; message: string }>;
    requestId?: string;
  };
}

/** Headers that must be propagated for distributed tracing. */
const TRACE_HEADERS = ['x-request-id', 'traceparent'] as const;

/** Copy incoming trace headers (when present) onto an outgoing request. */
export function traceHeaders(source: Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!source) return out;
  for (const name of TRACE_HEADERS) {
    const value = source.get(name);
    if (value) out[name] = value;
  }
  return out;
}

function serviceUnreachable(serviceLabel: string): ApiError {
  return new ApiError(
    503,
    'SERVICE_UNAVAILABLE',
    `${serviceLabel} is unreachable — start it with npm run dev`,
  );
}

/**
 * Fetch JSON from a service, always with cache: 'no-store'.
 * Throws {@link ApiError} on network failure or non-2xx responses.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: 'no-store' });
  } catch {
    // DNS / connection refused — surface a friendly, actionable error.
    throw new ApiError(
      503,
      'SERVICE_UNAVAILABLE',
      'A backend service is unreachable — start it with npm run dev',
    );
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as ErrorPayload | null;
    const err = body?.error;
    throw new ApiError(
      response.status,
      err?.code ?? 'UPSTREAM_ERROR',
      err?.message ?? `Request to ${url} failed with status ${response.status}`,
      err?.details,
      err?.requestId,
    );
  }

  return payload as T;
}

/** GET helper bound to a named service. */
export async function apiGet<T>(
  service: ServiceKey,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = getBaseUrls()[service].replace(/\/$/, '');
  return fetchJson<T>(`${base}${path}`, init);
}

/** POST helper bound to a named service (JSON body). */
export async function apiPost<T>(
  service: ServiceKey,
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const base = getBaseUrls()[service].replace(/\/$/, '');
  return fetchJson<T>(`${base}${path}`, {
    ...init,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Proxy an incoming route-handler request to a service URL.
 * Forwards trace headers, JSON bodies and the upstream status verbatim;
 * translates network failures into a friendly 503 payload.
 */
export async function proxyToService(
  request: Request,
  targetUrl: string,
  serviceLabel: string,
): Promise<NextResponse> {
  const method = request.method.toUpperCase();
  const headers = new Headers(traceHeaders(request.headers));

  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.text();
    if (body) headers.set('content-type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers,
      body: body || undefined,
      cache: 'no-store',
      // Node fetch: never follow service redirects silently.
      redirect: 'manual',
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `${serviceLabel} is unreachable — start it with npm run dev`,
        },
      },
      { status: 503 },
    );
  }

  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? 'application/json';

  return new NextResponse(text || null, {
    status: response.status,
    headers: {
      'content-type': contentType,
      ...(response.headers.get('x-request-id')
        ? { 'x-request-id': response.headers.get('x-request-id') as string }
        : {}),
    },
  });
}
