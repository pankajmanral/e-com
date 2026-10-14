import type { ServiceTarget } from './config';
import type { FetchLike } from './metrics/store';

export type ServiceStatus = 'up' | 'down' | 'degraded';
export type OverallStatus = 'healthy' | 'degraded' | 'critical';

export interface ServiceHealth {
  name: string;
  baseUrl: string;
  status: ServiceStatus;
  latencyMs: number;
  version?: string;
  httpStatus?: number;
  error?: string;
}

export interface HealthReport {
  overall: OverallStatus;
  checkedAt: string;
  services: ServiceHealth[];
}

/** Aggregates `GET <baseUrl>/health` across all targets with a short timeout. */
export async function checkHealth(
  targets: ServiceTarget[],
  fetchFn: FetchLike = (url, init) => fetch(url, init),
  timeoutMs = 1_500,
): Promise<HealthReport> {
  const services = await Promise.all(targets.map((target) => probeOne(target, fetchFn, timeoutMs)));

  const allUp = services.every((s) => s.status === 'up');
  const allDown = services.length > 0 && services.every((s) => s.status === 'down');
  const overall: OverallStatus = allUp ? 'healthy' : allDown ? 'critical' : 'degraded';

  return { overall, checkedAt: new Date().toISOString(), services };
}

async function probeOne(target: ServiceTarget, fetchFn: FetchLike, timeoutMs: number): Promise<ServiceHealth> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${target.baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const latencyMs = Date.now() - started;
    let body: { status?: string; version?: string } | null = null;
    try {
      body = (await response.json()) as { status?: string; version?: string };
    } catch {
      body = null;
    }
    if (!response.ok) {
      return {
        name: target.name,
        baseUrl: target.baseUrl,
        status: 'down',
        latencyMs,
        httpStatus: response.status,
        ...(body?.version ? { version: body.version } : {}),
        error: `responded HTTP ${response.status}`,
      };
    }
    const status: ServiceStatus = body?.status === 'degraded' ? 'degraded' : 'up';
    return {
      name: target.name,
      baseUrl: target.baseUrl,
      status,
      latencyMs,
      httpStatus: response.status,
      ...(body?.version ? { version: body.version } : {}),
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const err = error as Error;
    return {
      name: target.name,
      baseUrl: target.baseUrl,
      status: 'down',
      latencyMs,
      error: err?.name === 'AbortError' ? `no response within ${timeoutMs}ms` : (err?.message ?? 'unreachable'),
    };
  } finally {
    clearTimeout(timer);
  }
}
