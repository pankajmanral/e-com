import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import type { RequestHandler } from 'express';

export interface ServiceMetrics {
  service: string;
  registry: Registry;
  httpRequestsTotal: Counter<'service' | 'method' | 'route' | 'status'>;
  httpDuration: Histogram<'service' | 'method' | 'route' | 'status'>;
}

/**
 * Prometheus metrics for one service. Every service exposes the same metric
 * names on its own `/metrics` endpoint, which lets Prometheus and the
 * ops-service aggregate a system-wide view.
 *
 *   http_requests_total{service,method,route,status}
 *   http_request_duration_seconds{service,method,route,status}
 */
export function createMetrics(service: string): ServiceMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: `${service.replace(/-/g, '_')}_` });

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests handled by the service',
    labelNames: ['service', 'method', 'route', 'status'],
    registers: [registry],
  });

  const httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });

  return { service, registry, httpRequestsTotal, httpDuration };
}

/** Low-cardinality route label so Prometheus never explodes. */
export function routeLabel(baseUrl: string | undefined, routePath: unknown, fallback: string): string {
  if (typeof routePath === 'string') {
    const base = baseUrl ?? '';
    const suffix = routePath === '/' ? '' : routePath;
    const label = `${base}${suffix}`;
    return label === '' ? '/' : label;
  }
  return fallback;
}

export function httpMetricsMiddleware(metrics: ServiceMetrics): RequestHandler {
  return (req, res, next) => {
    const end = metrics.httpDuration.startTimer();
    res.on('finish', () => {
      const fallback = `${req.baseUrl || req.path.split('/').slice(0, 3).join('/')}` || 'unmatched';
      const labels = {
        service: metrics.service,
        method: req.method,
        route: routeLabel(req.baseUrl, (req as { route?: { path?: unknown } }).route?.path, fallback),
        status: String(res.statusCode),
      };
      end(labels);
      metrics.httpRequestsTotal.inc(labels);
    });
    next();
  };
}
