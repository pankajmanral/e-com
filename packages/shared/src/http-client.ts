import { AppError } from './errors';
import { CircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker';
import { currentRequestId, runWithRequestContext, newRequestId } from './context';
import { traceparentHeader } from './trace-context';

export interface ServiceClientOptions {
  /** Logical name of the upstream service, e.g. `product-service`. */
  service: string;
  baseUrl: string;
  timeoutMs?: number;
  breaker?: Omit<CircuitBreakerOptions, 'name'>;
}

export interface ServiceClientSnapshot {
  service: string;
  baseUrl: string;
  state: string;
  failures: number;
}

/**
 * Typed JSON client for inter-service communication with:
 *  - per-request timeout (AbortController)
 *  - circuit breaker (fail fast while an upstream is down)
 *  - W3C traceparent propagation (manual, in addition to auto-instrumentation)
 *  - request-id propagation for log correlation
 */
export class ServiceClient {
  readonly service: string;
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly breaker: CircuitBreaker;

  constructor(options: ServiceClientOptions) {
    this.service = options.service;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? Number(process.env.UPSTREAM_TIMEOUT_MS ?? 3_000);
    this.breaker = new CircuitBreaker({ name: options.service, ...options.breaker });
  }

  getBreakerSnapshot(): ServiceClientSnapshot {
    const snapshot = this.breaker.snapshot();
    return { service: this.service, baseUrl: this.baseUrl, state: snapshot.state, failures: snapshot.failures };
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    return this.breaker.exec(async () => {
      const requestId = currentRequestId() ?? newRequestId();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          accept: 'application/json',
          'x-request-id': requestId,
        };
        if (body !== undefined) headers['content-type'] = 'application/json';
        const traceparent = traceparentHeader();
        if (traceparent) headers.traceparent = traceparent;

        const response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });

        const text = await response.text();
        const payload = text ? safeJsonParse(text) : undefined;

        if (!response.ok) {
          const upstreamMessage =
            (payload as { error?: { message?: string } } | undefined)?.error?.message ??
            `Upstream ${this.service} responded ${response.status}`;
          if (response.status >= 500) {
            throw new AppError(503, 'UPSTREAM_ERROR', upstreamMessage, { service: this.service, status: response.status });
          }
          throw new AppError(response.status, 'UPSTREAM_CLIENT_ERROR', upstreamMessage, {
            service: this.service,
            status: response.status,
          });
        }
        return payload as T;
      } catch (error) {
        if (error instanceof AppError) throw error;
        if ((error as Error)?.name === 'AbortError') {
          throw new AppError(504, 'UPSTREAM_TIMEOUT', `${this.service} did not respond within ${this.timeoutMs}ms`, {
            service: this.service,
            url,
          });
        }
        throw new AppError(503, 'UPSTREAM_UNAVAILABLE', `${this.service} is unreachable (${(error as Error)?.message})`, {
          service: this.service,
          url,
        });
      } finally {
        clearTimeout(timer);
      }
    });
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Keep the async context across helper boundaries. */
export function withContext<T>(fn: () => T): T {
  return runWithRequestContext({ requestId: currentRequestId() ?? newRequestId() }, fn);
}
