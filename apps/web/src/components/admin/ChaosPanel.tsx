'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { usePolling } from '@/hooks/usePolling';
import { ApiError } from '@/lib/api';
import type { ChaosListResponse, ChaosTarget, ChaosType, Experiment, OpsStatus } from '@/lib/types';
import { formatClockTime, formatRelativeTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';
import ComparisonTable from './ComparisonTable';

const POLL_MS = 5_000;

const typeOptions: Array<{ value: ChaosType; label: string; description: string }> = [
  {
    value: 'pod-failure',
    label: 'Pod failure',
    description:
      'Terminates the service’s pod so the mesh fails over to a healthy replica — tests self-healing and recovery time.',
  },
  {
    value: 'network-latency',
    label: 'Network latency',
    description:
      'Injects extra round-trip delay on calls to the target service — tests timeout, retry and circuit-breaker behaviour.',
  },
  {
    value: 'service-outage',
    label: 'Service outage',
    description:
      'Makes the target service completely unavailable for the duration — tests graceful degradation of the storefront.',
  },
];

const targetOptions: ChaosTarget[] = ['user-service', 'product-service', 'order-service'];
const durationOptions = [15, 30, 60, 120];

function statusBadge(experiment: Experiment) {
  switch (experiment.status) {
    case 'running':
      return <Badge variant="teal-soft">Running</Badge>;
    case 'completed':
      return <Badge variant="positive">Completed</Badge>;
    case 'stopped':
      return <Badge variant="neutral">Stopped</Badge>;
    case 'failed':
      return (
        <Badge variant="critical">
          <svg viewBox="0 0 20 20" fill="none" className="size-3" aria-hidden="true">
            <path
              d="M10 6.5v4m0 3h.01M8.6 3.4 1.9 15a1.6 1.6 0 0 0 1.4 2.4h13.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.4a1.6 1.6 0 0 0-2.8 0Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{experiment.status}</Badge>;
  }
}

function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function LogViewer({ log }: { log: string[] }) {
  if (log.length === 0) return null;
  return (
    <details className="mt-3 group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-50 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden="true">
          <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="group-open:hidden">Show experiment log ({log.length} lines)</span>
        <span className="hidden group-open:inline">Hide experiment log</span>
      </summary>
      <pre className="scrollbar-thin mt-2 max-h-56 overflow-auto rounded-lg bg-navy-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-teal-300">
        {log.join('\n')}
      </pre>
    </details>
  );
}

function ExperimentResult({ experiment }: { experiment: Experiment }) {
  const deltaRows = useMemo(
    () => (experiment.delta ?? []).filter((row) => row.service === experiment.target),
    [experiment.delta, experiment.target],
  );
  const fullDelta = experiment.delta ?? [];

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-navy-900">Last experiment result</h3>
        {statusBadge(experiment)}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-navy-500">Type</dt>
          <dd className="font-medium text-navy-900">{typeOptions.find((t) => t.value === experiment.type)?.label ?? experiment.type}</dd>
        </div>
        <div>
          <dt className="text-xs text-navy-500">Target</dt>
          <dd className="font-mono text-xs font-medium text-navy-900">{experiment.target}</dd>
        </div>
        <div>
          <dt className="text-xs text-navy-500">Duration</dt>
          <dd className="font-medium text-navy-900 tabular-nums">{experiment.durationSec}s</dd>
        </div>
        <div>
          <dt className="text-xs text-navy-500">Provider</dt>
          <dd className="font-medium text-navy-900">{experiment.provider}</dd>
        </div>
      </dl>

      {experiment.error && (
        <ErrorBanner title="Experiment failed" className="mt-4">
          <p>{experiment.error}</p>
        </ErrorBanner>
      )}

      {deltaRows.length > 0 || fullDelta.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold tracking-widest text-navy-500 uppercase">
            Before vs after (snapshots{' '}
            <span className="font-mono normal-case">{experiment.beforeSnapshotId?.slice(0, 8) ?? '—'}</span> →{' '}
            <span className="font-mono normal-case">{experiment.afterSnapshotId?.slice(0, 8) ?? '—'}</span>)
          </h4>
          <div className="mt-2">
            <ComparisonTable rows={deltaRows.length > 0 ? deltaRows : fullDelta} />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-navy-200 bg-navy-50/50 px-4 py-4 text-center text-xs text-navy-500">
          No before/after comparison was recorded for this run.
        </p>
      )}

      <LogViewer log={experiment.log} />
    </div>
  );
}

async function fetchChaos(): Promise<ChaosListResponse> {
  const response = await fetch('/api/ops/chaos', { cache: 'no-store' });
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
  return (payload ?? { active: [], recent: [] }) as ChaosListResponse;
}

/**
 * Chaos control panel: launches controlled fault-injection experiments
 * against the local lab, tracks them live (countdown, logs, stop) and shows
 * post-run before/after snapshot comparisons.
 */
export default function ChaosPanel({
  status,
  hasExternalActivity,
}: {
  status: OpsStatus | null;
  hasExternalActivity: boolean;
}) {
  const chaosEnabled = status?.chaosEnabled ?? false;

  const [type, setType] = useState<ChaosType>('network-latency');
  const [target, setTarget] = useState<ChaosTarget>('product-service');
  const [durationSec, setDurationSec] = useState(30);
  const [delayMs, setDelayMs] = useState(2000);
  const [starting, setStarting] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [list, setList] = useState<ChaosListResponse>({ active: [], recent: [] });
  const [listLoading, setListLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const active = list.active ?? [];
  const recent = list.recent ?? [];
  const hasActive = active.length > 0;

  const refresh = useCallback(async () => {
    try {
      const next = await fetchChaos();
      setList(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach the chaos API.');
    } finally {
      setListLoading(false);
    }
  }, []);

  // Load once; poll every 5s while an experiment is running (or externally active).
  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, POLL_MS, hasActive || hasExternalActivity);

  // 1s countdown tick while experiments run.
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasActive]);

  const latestFinished = useMemo(
    () => recent.find((experiment) => experiment.status !== 'running') ?? recent[0] ?? null,
    [recent],
  );

  async function startExperiment() {
    const option = typeOptions.find((entry) => entry.value === type);
    const confirmed = window.confirm(
      `Start a "${option?.label}" experiment against ${target} for ${durationSec}s?` +
        (type === 'network-latency' ? ` (injecting ${delayMs}ms latency)` : '') +
        '\n\nThis only targets the local test lab — never production. Metrics and traces will capture the impact.',
    );
    if (!confirmed) return;

    setStarting(true);
    setError(null);
    try {
      const response = await fetch('/api/ops/chaos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          target,
          durationSec,
          ...(type === 'network-latency' ? { delayMs } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        if (response.status === 403 || body?.error?.code === 'CHAOS_FORBIDDEN') {
          throw new ApiError(
            403,
            'CHAOS_FORBIDDEN',
            body?.error?.message ??
              'Chaos is restricted to the local test environment. Set CHAOS_ENABLED=true and CHAOS_MODE=local.',
          );
        }
        throw new ApiError(
          response.status,
          body?.error?.code ?? 'UPSTREAM_ERROR',
          body?.error?.message ?? `Chaos start failed with status ${response.status}`,
        );
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not start the experiment.');
    } finally {
      setStarting(false);
    }
  }

  async function stopExperiment(id: string) {
    setStoppingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/ops/chaos/${id}/stop`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new ApiError(response.status, 'UPSTREAM_ERROR', body?.error?.message ?? 'Stop failed.');
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not stop the experiment.');
    } finally {
      setStoppingId(null);
    }
  }

  const selectedType = typeOptions.find((entry) => entry.value === type);

  return (
    <div className="space-y-6">
      {/* Control panel */}
      <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-navy-900">Chaos experiments</h2>
            <p className="mt-0.5 text-sm text-navy-600">
              Controlled fault injection against the local lab.
            </p>
          </div>
          <Badge variant={chaosEnabled ? 'positive' : 'outline'} dot>
            {chaosEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        {!chaosEnabled ? (
          <div className="mt-4 rounded-xl border border-navy-200 bg-navy-50/70 p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white">
                <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
                  <path
                    d="M12 8v5m0 3h.01M7 11V7a5 5 0 0 1 10 0v4M6 11h12l-1 9H7l-1-9Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <h3 className="text-sm font-semibold text-navy-900">Chaos controls are locked</h3>
                <p className="mt-1 text-sm leading-relaxed text-navy-600">
                  Chaos controls are disabled outside the local lab. Set{' '}
                  <code className="rounded bg-navy-900 px-1.5 py-0.5 font-mono text-xs text-teal-200">
                    CHAOS_ENABLED=true
                  </code>{' '}
                  and{' '}
                  <code className="rounded bg-navy-900 px-1.5 py-0.5 font-mono text-xs text-teal-200">
                    CHAOS_MODE=local
                  </code>{' '}
                  on the ops service to enable fault injection.
                </p>
                {status?.chaosGuard.reason && (
                  <p className="mt-2 text-xs text-navy-500">Guard: {status.chaosGuard.reason}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Experiment type"
                value={type}
                onChange={(event) => setType(event.target.value as ChaosType)}
              >
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Target service"
                value={target}
                onChange={(event) => setTarget(event.target.value as ChaosTarget)}
              >
                {targetOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>

            {selectedType && (
              <p className="rounded-lg bg-navy-50 px-3 py-2 text-xs leading-relaxed text-navy-600">
                <span className="font-semibold text-navy-800">{selectedType.label}:</span>{' '}
                {selectedType.description}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Duration"
                value={String(durationSec)}
                onChange={(event) => setDurationSec(Number(event.target.value))}
              >
                {durationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} seconds
                  </option>
                ))}
              </Select>

              {type === 'network-latency' && (
                <div>
                  <label htmlFor="delay-ms" className="mb-1.5 block text-sm font-medium text-navy-800">
                    Injected latency (ms)
                  </label>
                  <input
                    id="delay-ms"
                    type="number"
                    min={50}
                    max={30000}
                    step={50}
                    value={delayMs}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setDelayMs(Number.isFinite(value) ? Math.min(30000, Math.max(50, value)) : 2000);
                    }}
                    className="h-10 w-full rounded-lg border border-navy-200 bg-white px-3 text-sm text-navy-800 tabular-nums hover:border-navy-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
                  />
                  <p className="mt-1 text-xs text-navy-500">50–30,000 ms of extra round-trip delay.</p>
                </div>
              )}
            </div>

            <Button type="button" variant="navy" loading={starting} onClick={() => void startExperiment()}>
              {starting ? 'Starting…' : 'Start experiment'}
            </Button>
          </div>
        )}

        {error && (
          <ErrorBanner title="Chaos action failed" className="mt-4">
            <p>{error}</p>
          </ErrorBanner>
        )}
      </div>

      {/* Active experiments */}
      {hasActive && (
        <div className="space-y-4" aria-live="polite">
          {active.map((experiment) => {
            const remaining = new Date(experiment.endsAt).getTime() - now;
            const provider = experiment.provider?.toLowerCase() ?? 'local';
            return (
              <div
                key={experiment.id}
                className="animate-fade-up rounded-xl border border-teal-300 bg-teal-50/60 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="relative flex size-2.5" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-500 opacity-60" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-teal-600" />
                    </span>
                    <h3 className="text-sm font-semibold text-navy-900">
                      {typeOptions.find((entry) => entry.value === experiment.type)?.label ?? experiment.type}{' '}
                      on <span className="font-mono">{experiment.target}</span>
                    </h3>
                    <Badge variant="outline">
                      {provider.includes('istio')
                        ? 'istio'
                        : provider.includes('chaos')
                          ? 'chaos-mesh'
                          : 'local'}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    loading={stoppingId === experiment.id}
                    onClick={() => void stopExperiment(experiment.id)}
                    aria-label={`Stop experiment ${experiment.id}`}
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden="true">
                      <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" />
                    </svg>
                    Stop
                  </Button>
                </div>

                <p className="mt-3 text-sm text-navy-700">
                  Ends in{' '}
                  <span className="font-mono text-base font-semibold text-navy-900 tabular-nums">
                    {formatCountdown(remaining)}
                  </span>{' '}
                  <span className="text-navy-500">
                    (started {formatRelativeTime(experiment.startedAt)} · {experiment.durationSec}s total)
                  </span>
                </p>

                <LogViewer log={experiment.log} />
              </div>
            );
          })}
        </div>
      )}

      {/* Latest finished run */}
      {latestFinished && !hasActive && <ExperimentResult experiment={latestFinished} />}

      {/* Recent list */}
      <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
        <h3 className="text-sm font-semibold text-navy-900">Recent experiments</h3>
        {listLoading && recent.length === 0 ? (
          <div className="mt-4 space-y-2">
            {[0, 1].map((index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-navy-100/70" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            className="mt-4 border-0 bg-transparent px-0 py-8 shadow-none"
            title="No experiments yet"
            description={
              chaosEnabled
                ? 'Launch your first experiment above — before/after snapshots are captured automatically.'
                : 'Enable chaos in the local lab to run experiments.'
            }
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
                <path d="M9 3v6l-5 9a3 3 0 0 0 2.6 4.5h10.8A3 3 0 0 0 20 18l-5-9V3M8 3h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        ) : (
          <ul className="mt-3 divide-y divide-navy-50">
            {recent.slice(0, 8).map((experiment) => (
              <li key={experiment.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {statusBadge(experiment)}
                  <span className="text-navy-800">
                    {typeOptions.find((entry) => entry.value === experiment.type)?.label ?? experiment.type}
                  </span>
                  <span className="font-mono text-xs text-navy-500">→ {experiment.target}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-navy-500 tabular-nums">
                  <span>{experiment.durationSec}s</span>
                  <span title={new Date(experiment.startedAt).toLocaleString('en-IN')}>
                    {formatClockTime(experiment.startedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
