'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePolling } from '@/hooks/usePolling';
import { ApiError } from '@/lib/api';
import type {
  ChaosListResponse,
  Health,
  MetricsHistoryResponse,
  MetricsResponse,
  OpsStatus,
} from '@/lib/types';
import { formatClockTime } from '@/lib/format';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import StatusStrip from './StatusStrip';
import ServiceHealthGrid from './ServiceHealthGrid';
import MetricCharts from './MetricCharts';
import SnapshotPanel from './SnapshotPanel';
import ChaosPanel from './ChaosPanel';

const POLL_INTERVAL_MS = 5000;
export type MetricWindow = '5m' | '15m' | '30m';

interface DashboardState {
  health: Health | null;
  status: OpsStatus | null;
  metrics: MetricsResponse | null;
  history: MetricsHistoryResponse | null;
  chaos: ChaosListResponse | null;
  error: string | null;
  loading: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'UPSTREAM_ERROR',
      body?.error?.message ?? `Request failed with status ${response.status}`,
    );
  }
  return payload as T;
}

/**
 * Admin dashboard orchestrator: polls the ops service every 5s and composes
 * the status strip, health grid, charts, snapshot comparator and chaos panel.
 */
export default function AdminDashboard() {
  const [window_, setWindow] = useState<MetricWindow>('5m');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [state, setState] = useState<DashboardState>({
    health: null,
    status: null,
    metrics: null,
    history: null,
    chaos: null,
    error: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const [health, status, metrics, history, chaos] = await Promise.all([
        getJson<Health>('/api/ops/health'),
        getJson<OpsStatus>('/api/ops/status'),
        getJson<MetricsResponse>(`/api/ops/metrics?window=${window_}`),
        getJson<MetricsHistoryResponse>(`/api/ops/metrics/history?window=${window_}`),
        getJson<ChaosListResponse>('/api/ops/chaos'),
      ]);
      setState({ health, status, metrics, history, chaos, error: null, loading: false });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'The ops service returned an unexpected response.';
      setState((current) => ({ ...current, error: message, loading: false }));
    }
  }, [window_]);

  usePolling(refresh, POLL_INTERVAL_MS);

  const lastUpdated = useMemo(() => {
    const checkedAt = state.health?.checkedAt;
    return checkedAt ? formatClockTime(checkedAt) : null;
  }, [state.health?.checkedAt]);

  const hasChaosActivity = (state.chaos?.active.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-teal-600 uppercase">
            Service-mesh resilience lab
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-navy-900">
            Resilience dashboard
          </h1>
          <p className="mt-1.5 max-w-2xl text-navy-600">
            Live health, metrics and controlled chaos experiments across the user, product and
            order services.
          </p>
        </div>
        {lastUpdated && (
          <p className="text-sm text-navy-500 tabular-nums" aria-live="polite">
            Last updated {lastUpdated}
          </p>
        )}
      </div>

      {state.error && (
        <ErrorBanner title="Some data could not be refreshed">
          <p>{state.error}</p>
          <p className="mt-1">
            Start the ops service (default{' '}
            <code className="rounded bg-navy-800 px-1.5 py-0.5 font-mono text-xs text-teal-200">
              http://localhost:4004
            </code>
            ) to restore live data.
          </p>
        </ErrorBanner>
      )}

      <StatusStrip status={state.status} health={state.health} loading={state.loading} />

      <section aria-labelledby="health-heading">
        <h2 id="health-heading" className="sr-only">
          Service health
        </h2>
        <ServiceHealthGrid
          health={state.health}
          loading={state.loading}
          selectedService={selectedService}
          onSelect={setSelectedService}
        />
      </section>

      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Metrics
        </h2>
        <MetricCharts
          history={state.history}
          metrics={state.metrics}
          window={window_}
          onWindowChange={setWindow}
          selectedService={selectedService}
          onSelectService={setSelectedService}
          loading={state.loading}
        />
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <section aria-labelledby="snapshots-heading">
          <h2 id="snapshots-heading" className="sr-only">
            Snapshots
          </h2>
          <SnapshotPanel />
        </section>
        <section aria-labelledby="chaos-heading">
          <h2 id="chaos-heading" className="sr-only">
            Chaos experiments
          </h2>
          <ChaosPanel status={state.status} hasExternalActivity={hasChaosActivity} />
        </section>
      </div>
    </div>
  );
}
