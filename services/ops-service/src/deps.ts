import { createLogger } from '@ecommerce/shared';
import type { Logger } from 'pino';
import { checkHealth, type HealthReport } from './health';
import { loadConfig, type OpsConfig } from './config';
import { PrometheusClient } from './metrics/prometheus';
import { MetricsStore, type MetricsSummary, type MetricsHistorySeries } from './metrics/store';
import { ChaosManager } from './chaos/manager';
import { createKubectlContextGetter, type ContextGetter } from './chaos/providers';
import { OpsStateStore, type MetricsSource, type Snapshot } from './store';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpsDeps {
  config: OpsConfig;
  logger: Logger;
  state: OpsStateStore;
  metricsStore: MetricsStore;
  prometheus: PrometheusClient;
  /** Aggregated `GET <svc>/health` across all targets. */
  probeHealth: () => Promise<HealthReport>;
  /** Prometheus-first current metrics with silent scrape fallback. */
  metricsCurrent: (windowSec: number) => Promise<{ source: MetricsSource; services: MetricsSummary[] }>;
  /** Prometheus-first history with silent scrape fallback. */
  metricsHistory: (windowSec: number) => Promise<{ source: MetricsSource; series: MetricsHistorySeries[] }>;
  /** Metrics + health in one shot (used by snapshots). */
  captureSnapshot: (label?: string) => Promise<Snapshot>;
  /** `kubectl config current-context` (available=false when kubectl is missing). */
  contextGetter: ContextGetter;
  chaos: ChaosManager;
}

/** Parses a Prometheus-style window (`5m`, `90s`, `1h`) into seconds. */
export function parseWindowSec(value: string | undefined, fallbackSec = 300): number {
  const match = /^(\d+)([smhd])$/.exec(value?.trim() ?? '');
  if (!match || !match[1] || !match[2]) return fallbackSec;
  const amount = Number(match[1]);
  const unit = match[2];
  const seconds = unit === 's' ? amount : unit === 'm' ? amount * 60 : unit === 'h' ? amount * 3_600 : amount * 86_400;
  return Math.min(seconds, 7 * 86_400);
}

/**
 * Production dependency wiring. Every piece is overridable so tests can inject
 * fake clocks, fetch functions and kubectl runners.
 */
export function buildDeps(overrides: Partial<OpsDeps> = {}, env: NodeJS.ProcessEnv = process.env): OpsDeps {
  const config = overrides.config ?? loadConfig(env);
  const logger = overrides.logger ?? createLogger('ops-service');
  const fetchFn: FetchLike = (url, init) => fetch(url, init);

  const state = overrides.state ?? new OpsStateStore({ logger });
  const contextGetter = overrides.contextGetter ?? createKubectlContextGetter(config.kubectlBin, 3_000);
  const metricsStore =
    overrides.metricsStore ??
    new MetricsStore({
      targets: config.services,
      intervalMs: config.metricsPollIntervalMs,
      historyPoints: config.metricsHistoryPoints,
      fetchFn,
      logger,
    });
  const prometheus = overrides.prometheus ?? new PrometheusClient({ url: config.prometheusUrl, fetchFn, logger });

  const probeHealth: OpsDeps['probeHealth'] = overrides.probeHealth ?? (() => checkHealth(config.services, fetchFn));

  const metricsCurrent: OpsDeps['metricsCurrent'] =
    overrides.metricsCurrent ??
    (async (windowSec) => {
      if (await prometheus.isAvailable()) {
        const fromProm = await prometheus.current(
          config.services.map((s) => s.name),
          windowSec,
        );
        if (fromProm) return { source: 'prometheus' as const, services: fromProm };
      }
      return { source: 'scrape' as const, services: metricsStore.windowSummary(windowSec) };
    });

  const metricsHistory: OpsDeps['metricsHistory'] =
    overrides.metricsHistory ??
    (async (windowSec) => {
      if (await prometheus.isAvailable()) {
        const fromProm = await prometheus.history(
          config.services.map((s) => s.name),
          windowSec,
        );
        if (fromProm) return { source: 'prometheus' as const, series: fromProm };
      }
      return { source: 'scrape' as const, series: metricsStore.history(windowSec) };
    });

  const captureSnapshot: OpsDeps['captureSnapshot'] =
    overrides.captureSnapshot ??
    (async (label) => {
      const [metrics, health] = await Promise.all([metricsCurrent(300), probeHealth()]);
      const perService: Snapshot['health']['perService'] = {};
      for (const entry of health.services) perService[entry.name] = entry.status;
      return state.addSnapshot({
        label: label?.trim() || `snapshot-${new Date().toISOString()}`,
        source: metrics.source,
        services: metrics.services.map((s) => ({
          service: s.service,
          requestsPerSec: s.requestsPerSec,
          errorRate: s.errorRate,
          p95LatencyMs: s.p95LatencyMs,
        })),
        health: { overall: health.overall, perService },
      });
    });

  const chaos =
    overrides.chaos ??
    new ChaosManager({
      config,
      store: state,
      captureSnapshot,
      fetchFn,
      contextGetter,
      logger,
    });

  return {
    config,
    logger,
    state,
    metricsStore,
    prometheus,
    probeHealth,
    metricsCurrent,
    metricsHistory,
    captureSnapshot,
    contextGetter,
    chaos,
  };
}
