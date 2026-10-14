import { Logger } from 'pino';
import type { ServiceTarget } from '../config';
import { errorRate, histogramQuantile, ratePerSec, round } from './histogram';
import {
  deltaBuckets,
  isServerErrorLabel,
  parsePrometheusText,
  sumCounter,
  sumCounterMatching,
  type ParsedMetrics,
} from './parser';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface MetricsPoint {
  /** Epoch milliseconds of the scrape that produced this sample. */
  t: number;
  requestsPerSec: number;
  /** 0..1 */
  errorRate: number;
  p95LatencyMs: number;
  /** Requests observed since the previous scrape (interval total). */
  totalRequests: number;
  totalErrors: number;
}

export interface MetricsSummary {
  service: string;
  requestsPerSec: number;
  errorRate: number;
  p95LatencyMs: number;
  totalRequests: number;
  totalErrors: number;
}

export interface MetricsHistorySeries {
  service: string;
  points: { t: string; requestsPerSec: number; errorRate: number; p95LatencyMs: number }[];
}

export interface MetricsStoreOptions {
  targets: ServiceTarget[];
  intervalMs: number;
  historyPoints: number;
  fetchFn?: FetchLike;
  logger?: Logger;
  scrapeTimeoutMs?: number;
}

interface PreviousScrape {
  t: number;
  parsed: ParsedMetrics;
}

/**
 * Polls every target service's `/metrics` endpoint, derives per-interval
 * request rate / error rate / p95 latency from counter + histogram deltas and
 * keeps a bounded ring buffer of samples per service. A failing target never
 * crashes the poller — its history simply pauses until it answers again.
 */
export class MetricsStore {
  readonly targets: ServiceTarget[];
  private readonly intervalMs: number;
  private readonly historyPoints: number;
  private readonly scrapeTimeoutMs: number;
  private readonly fetchFn: FetchLike;
  private readonly logger: Logger | undefined;
  private readonly ring = new Map<string, MetricsPoint[]>();
  private readonly previous = new Map<string, PreviousScrape>();
  private timer: NodeJS.Timeout | null = null;

  constructor(options: MetricsStoreOptions) {
    this.targets = options.targets;
    this.intervalMs = options.intervalMs;
    this.historyPoints = options.historyPoints;
    this.scrapeTimeoutMs = options.scrapeTimeoutMs ?? 2_000;
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.logger = options.logger;
    for (const target of options.targets) this.ring.set(target.name, []);
  }

  /** Starts the background poller (unref'd so it never blocks shutdown). */
  start(): void {
    if (this.timer) return;
    void this.scrapeOnce();
    this.timer = setInterval(() => void this.scrapeOnce(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One scrape round across all targets (also used directly by tests). */
  async scrapeOnce(): Promise<void> {
    await Promise.allSettled(this.targets.map((target) => this.scrapeTarget(target)));
  }

  private async scrapeTarget(target: ServiceTarget): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.scrapeTimeoutMs);
    try {
      const response = await this.fetchFn(`${target.baseUrl}/metrics`, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'text/plain' },
      });
      if (!response.ok) return;
      const text = await response.text();
      const parsed = parsePrometheusText(text);
      const now = Date.now();
      const prev = this.previous.get(target.name);
      this.previous.set(target.name, { t: now, parsed });
      if (!prev) return; // first scrape only seeds the baseline

      const dtSec = (now - prev.t) / 1000;
      if (!Number.isFinite(dtSec) || dtSec <= 0) return;

      const totalBefore = sumCounter(prev.parsed.counters, 'http_requests_total');
      const totalNow = sumCounter(parsed.counters, 'http_requests_total');
      const errorsBefore = sumCounterMatching(prev.parsed.counters, 'http_requests_total', isServerErrorLabel);
      const errorsNow = sumCounterMatching(parsed.counters, 'http_requests_total', isServerErrorLabel);

      const totalDelta = totalNow >= totalBefore ? totalNow - totalBefore : totalNow;
      const errorDelta = errorsNow >= errorsBefore ? errorsNow - errorsBefore : errorsNow;

      let p95LatencyMs = 0;
      const duration = parsed.histograms.http_request_duration_seconds;
      if (duration && duration.count > 0) {
        const prevDuration = prev.parsed.histograms.http_request_duration_seconds;
        const bucketDelta = deltaBuckets(prevDuration?.buckets ?? {}, duration.buckets);
        const quantile = histogramQuantile(0.95, bucketDelta);
        if (quantile !== null && Number.isFinite(quantile)) p95LatencyMs = round(quantile * 1_000, 2);
      }

      const point: MetricsPoint = {
        t: now,
        requestsPerSec: round(ratePerSec(totalBefore, totalNow, dtSec)),
        errorRate: round(errorRate(errorsBefore, errorsNow, errorDelta, totalDelta)),
        p95LatencyMs,
        totalRequests: Math.max(0, Math.round(totalDelta)),
        totalErrors: Math.max(0, Math.round(errorDelta)),
      };
      this.push(target.name, point);
    } catch (error) {
      this.logger?.debug({ service: target.name, err: error }, 'metrics scrape failed');
    } finally {
      clearTimeout(timer);
    }
  }

  private push(service: string, point: MetricsPoint): void {
    const ring = this.ring.get(service) ?? [];
    ring.push(point);
    while (ring.length > this.historyPoints) ring.shift();
    this.ring.set(service, ring);
  }

  /** Raw ring (newest last) — exposed for tests. */
  points(service: string, windowSec: number, now = Date.now()): MetricsPoint[] {
    const cutoff = now - windowSec * 1_000;
    return (this.ring.get(service) ?? []).filter((p) => p.t >= cutoff);
  }

  /**
   * Window aggregate per service:
   *   - totals are summed over the interval deltas in the window,
   *   - requestsPerSec = totalRequests / window seconds,
   *   - errorRate      = totalErrors / totalRequests (0 without traffic),
   *   - p95LatencyMs   = the most recent sample's p95.
   * Services without any sample in the window are reported as zeros so the
   * response shape stays stable for the dashboard.
   */
  windowSummary(windowSec: number, now = Date.now()): MetricsSummary[] {
    return this.targets.map((target) => {
      const points = this.points(target.name, windowSec, now);
      const totalRequests = points.reduce((acc, p) => acc + p.totalRequests, 0);
      const totalErrors = points.reduce((acc, p) => acc + p.totalErrors, 0);
      const latest = points[points.length - 1];
      const effectiveSec = Math.max(1, windowSec);
      return {
        service: target.name,
        requestsPerSec: round(totalRequests / effectiveSec),
        errorRate: round(totalRequests > 0 ? totalErrors / totalRequests : 0),
        p95LatencyMs: latest?.p95LatencyMs ?? 0,
        totalRequests,
        totalErrors,
      };
    });
  }

  /** Down-sampled history for the dashboard charts. */
  history(windowSec: number, maxPoints = 500, now = Date.now()): MetricsHistorySeries[] {
    return this.targets.map((target) => {
      const points = this.points(target.name, windowSec, now);
      const step = Math.max(1, Math.ceil(points.length / maxPoints));
      const sampled = points.filter((_, index) => index % step === 0 || index === points.length - 1);
      return {
        service: target.name,
        points: sampled.map((p) => ({
          t: new Date(p.t).toISOString(),
          requestsPerSec: p.requestsPerSec,
          errorRate: p.errorRate,
          p95LatencyMs: p.p95LatencyMs,
        })),
      };
    });
  }
}
