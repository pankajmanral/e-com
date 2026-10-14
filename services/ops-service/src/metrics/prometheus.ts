import type { Logger } from 'pino';
import { errorRate as clampRate, histogramQuantile, round } from './histogram';
import type { FetchLike, MetricsHistorySeries, MetricsSummary } from './store';

interface PromApi {
  status: string;
  data?: {
    resultType?: string;
    result?: Array<{
      metric?: Record<string, string>;
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
  error?: string;
}

export interface PrometheusClientOptions {
  url: string;
  fetchFn?: FetchLike;
  logger?: Logger;
  /** Ready-probe timeout (spec: 1.5s). */
  readyTimeoutMs?: number;
  /** How long a ready/not-ready verdict stays cached (spec: 60s). */
  recheckIntervalMs?: number;
  now?: () => number;
}

function toNumber(value: [number, string] | undefined): number {
  if (!value) return 0;
  const parsed = Number(value[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** PromQL window for the given seconds, e.g. 120 → `2m`. */
export function promWindow(seconds: number): string {
  const sec = Math.max(5, Math.round(seconds));
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

/**
 * Thin Prometheus HTTP-API client. Availability is probed on `/-/ready` with a
 * short timeout at boot and re-checked lazily every minute; every query method
 * returns `null` on failure so callers silently fall back to scraped data.
 */
export class PrometheusClient {
  readonly url: string;
  private readonly fetchFn: FetchLike;
  private readonly logger: Logger | undefined;
  private readonly readyTimeoutMs: number;
  private readonly recheckIntervalMs: number;
  private readonly now: () => number;
  private verdict: { available: boolean; checkedAt: number } | null = null;
  private warnedUnavailable = false;

  constructor(options: PrometheusClientOptions) {
    this.url = options.url;
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.logger = options.logger;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 1_500;
    this.recheckIntervalMs = options.recheckIntervalMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  /** Fire the boot-time readiness probe (never blocks startup). */
  warmUp(): void {
    void this.isAvailable();
  }

  async isAvailable(): Promise<boolean> {
    const now = this.now();
    if (this.verdict && now - this.verdict.checkedAt < this.recheckIntervalMs) {
      return this.verdict.available;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.readyTimeoutMs);
    try {
      const response = await this.fetchFn(`${this.url}/-/ready`, { method: 'GET', signal: controller.signal });
      this.verdict = { available: response.ok, checkedAt: now };
    } catch {
      this.verdict = { available: false, checkedAt: now };
    } finally {
      clearTimeout(timer);
    }
    if (!this.verdict.available && !this.warnedUnavailable) {
      this.warnedUnavailable = true;
      this.logger?.warn({ url: this.url }, 'Prometheus not ready — falling back to direct /metrics scraping');
    }
    return this.verdict.available;
  }

  private async query(expr: string): Promise<Map<string, number>> {
    const url = `${this.url}/api/v1/query?query=${encodeURIComponent(expr)}`;
    const response = await this.fetchFn(url, { method: 'GET', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`prometheus query failed with ${response.status}`);
    const payload = (await response.json()) as PromApi;
    if (payload.status !== 'success' || !payload.data?.result) {
      throw new Error(payload.error ?? 'unexpected prometheus response');
    }
    const values = new Map<string, number>();
    for (const sample of payload.data.result) {
      const service = sample.metric?.service ?? sample.metric?.instance ?? 'unknown';
      values.set(service, toNumber(sample.value));
    }
    return values;
  }

  private async queryRange(expr: string, startSec: number, endSec: number, stepSec: number): Promise<Map<string, Array<[number, number]>>> {
    const url =
      `${this.url}/api/v1/query_range?query=${encodeURIComponent(expr)}` +
      `&start=${startSec}&end=${endSec}&step=${stepSec}`;
    const response = await this.fetchFn(url, { method: 'GET', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`prometheus query_range failed with ${response.status}`);
    const payload = (await response.json()) as PromApi;
    if (payload.status !== 'success' || !payload.data?.result) {
      throw new Error(payload.error ?? 'unexpected prometheus response');
    }
    const series = new Map<string, Array<[number, number]>>();
    for (const sample of payload.data.result) {
      const service = sample.metric?.service ?? sample.metric?.instance ?? 'unknown';
      const values = (sample.values ?? []).map(([t, v]): [number, number] => {
        const parsed = Number(v);
        return [t * 1_000, Number.isFinite(parsed) ? parsed : 0];
      });
      series.set(service, values);
    }
    return series;
  }

  /**
   * Instant view of every service. Returns `null` when any query fails so the
   * caller can use scrape data instead.
   */
  async current(serviceNames: string[], windowSec: number): Promise<MetricsSummary[] | null> {
    try {
      const window = promWindow(Math.max(60, windowSec));
      const [rps, errorRatio, p95, totals, totalsErrors] = await Promise.all([
        this.query('sum by (service) (rate(http_requests_total[2m]))'),
        this.query(
          'sum by (service) (rate(http_requests_total{status=~"5.."}[2m])) / ignoring(status) sum by (service) (rate(http_requests_total[2m]))',
        ),
        this.query('histogram_quantile(0.95, sum by (le,service) (rate(http_request_duration_seconds_bucket[5m])))'),
        this.query(`sum by (service) (increase(http_requests_total[${window}]))`),
        this.query(`sum by (service) (increase(http_requests_total{status=~"5.."}[${window}]))`),
      ]);
      return serviceNames.map((service) => ({
        service,
        requestsPerSec: round(rps.get(service) ?? 0),
        // divide-by-zero renders as +Inf/NaN in PromQL — treat as 0 errors
        errorRate: round(clampRate(0, 0, errorRatio.get(service) ?? 0, 1)),
        p95LatencyMs: round((p95.get(service) ?? 0) * 1_000, 2),
        totalRequests: Math.max(0, Math.round(totals.get(service) ?? 0)),
        totalErrors: Math.max(0, Math.round(totalsErrors.get(service) ?? 0)),
      }));
    } catch (error) {
      this.logger?.warn({ err: error }, 'prometheus instant query failed — using scrape fallback');
      return null;
    }
  }

  /** Range view over `windowSec` (step >= 5s). Returns `null` on failure. */
  async history(serviceNames: string[], windowSec: number, maxPoints = 500): Promise<MetricsHistorySeries[] | null> {
    try {
      const stepSec = Math.max(5, Math.ceil(windowSec / maxPoints));
      const endSec = Math.floor(this.now() / 1000);
      const startSec = endSec - windowSec;
      const [rps, errorRatio, p95] = await Promise.all([
        this.queryRange('sum by (service) (rate(http_requests_total[2m]))', startSec, endSec, stepSec),
        this.queryRange(
          'sum by (service) (rate(http_requests_total{status=~"5.."}[2m])) / ignoring(status) sum by (service) (rate(http_requests_total[2m]))',
          startSec,
          endSec,
          stepSec,
        ),
        this.queryRange(
          'histogram_quantile(0.95, sum by (le,service) (rate(http_request_duration_seconds_bucket[5m])))',
          startSec,
          endSec,
          stepSec,
        ),
      ]);
      const tolerance = stepSec * 1_000 * 0.75;
      const lookup = (values: Array<[number, number]> | undefined, t: number): number => {
        if (!values || values.length === 0) return 0;
        let best = Number.NaN;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const [vt, vv] of values) {
          const distance = Math.abs(vt - t);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = vv;
          }
        }
        return bestDistance <= tolerance ? best : 0;
      };
      return serviceNames.map((service) => ({
        service,
        points: (rps.get(service) ?? []).map(([t, value]) => ({
          t: new Date(t).toISOString(),
          requestsPerSec: round(value),
          errorRate: round(clampRate(0, 0, lookup(errorRatio.get(service), t), 1)),
          p95LatencyMs: round(lookup(p95.get(service), t) * 1_000, 2),
        })),
      }));
    } catch (error) {
      this.logger?.warn({ err: error }, 'prometheus range query failed — using scrape fallback');
      return null;
    }
  }
}

/** Re-exported so callers can plug the quantile into custom pipelines. */
export { histogramQuantile };
