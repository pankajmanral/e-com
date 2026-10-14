'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import type { ComparisonResponse, Snapshot } from '@/lib/types';
import { formatClockTime, formatRelativeTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import ComparisonTable from './ComparisonTable';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
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
 * Snapshot manager: capture point-in-time metric snapshots, list them and
 * compare any two (before/after) side by side.
 */
export default function SnapshotPanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [taking, setTaking] = useState(false);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await requestJson<{ items: Snapshot[] }>('/api/ops/snapshots');
      setSnapshots(data.items ?? []);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load snapshots.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [snapshots],
  );

  async function takeSnapshot() {
    setTaking(true);
    setError(null);
    try {
      await requestJson<Snapshot>('/api/ops/snapshots', {
        method: 'POST',
        body: JSON.stringify(label.trim() ? { label: label.trim() } : {}),
      });
      setLabel('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not take the snapshot.');
    } finally {
      setTaking(false);
    }
  }

  async function compare() {
    if (!beforeId || !afterId) return;
    setComparing(true);
    setError(null);
    try {
      const data = await requestJson<ComparisonResponse>(
        `/api/ops/compare/${encodeURIComponent(beforeId)}/${encodeURIComponent(afterId)}`,
      );
      setComparison(data);
    } catch (caught) {
      setComparison(null);
      setError(caught instanceof ApiError ? caught.message : 'Could not compare the snapshots.');
    } finally {
      setComparing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Capture */}
      <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
        <h2 className="text-base font-semibold text-navy-900">Metric snapshots</h2>
        <p className="mt-0.5 text-sm text-navy-600">
          Capture the current metrics, then compare two points in time — e.g. before and after a
          chaos run.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="snapshot-label" className="mb-1.5 block text-sm font-medium text-navy-800">
              Label (optional)
            </label>
            <input
              id="snapshot-label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. baseline before latency test"
              maxLength={80}
              className="h-10 w-full rounded-lg border border-navy-200 bg-white px-3 text-sm text-navy-800 placeholder:text-navy-400 hover:border-navy-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
            />
          </div>
          <Button type="button" variant="teal" loading={taking} onClick={() => void takeSnapshot()}>
            {taking ? 'Capturing…' : 'Take snapshot'}
          </Button>
        </div>

        {error && (
          <ErrorBanner title="Snapshot action failed" className="mt-4">
            <p>{error}</p>
          </ErrorBanner>
        )}
      </div>

      {/* List + compare */}
      <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
        <h3 className="text-sm font-semibold text-navy-900">Captured snapshots</h3>

        {loading && sorted.length === 0 ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-navy-100/70" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            className="mt-3 border-0 bg-transparent px-0 py-8 shadow-none"
            title="No snapshots yet"
            description="Take a snapshot to pin the current metrics — you will need at least two to compare."
          />
        ) : (
          <ul className="mt-3 max-h-72 divide-y divide-navy-50 overflow-y-auto scrollbar-thin pr-1">
            {sorted.map((snapshot) => (
              <li key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <code className="shrink-0 font-mono text-xs text-navy-400">
                    {snapshot.id.slice(0, 8)}
                  </code>
                  <span className="truncate text-navy-800">{snapshot.label || '—'}</span>
                  <Badge
                    variant={snapshot.health?.overall === 'healthy' ? 'positive' : 'neutral'}
                  >
                    {snapshot.health?.overall ?? 'unknown'}
                  </Badge>
                </div>
                <span
                  className="shrink-0 text-xs text-navy-500 tabular-nums"
                  title={new Date(snapshot.createdAt).toLocaleString('en-GB')}
                >
                  {formatClockTime(snapshot.createdAt)} · {formatRelativeTime(snapshot.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {sorted.length >= 2 && (
          <div className="mt-4 border-t border-navy-100 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Select
                label="Before"
                value={beforeId}
                onChange={(event) => {
                  setBeforeId(event.target.value);
                  setComparison(null);
                }}
              >
                <option value="">Select…</option>
                {sorted.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {formatClockTime(snapshot.createdAt)} · {snapshot.label || snapshot.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
              <Select
                label="After"
                value={afterId}
                onChange={(event) => {
                  setAfterId(event.target.value);
                  setComparison(null);
                }}
              >
                <option value="">Select…</option>
                {sorted.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {formatClockTime(snapshot.createdAt)} · {snapshot.label || snapshot.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="navy"
                loading={comparing}
                disabled={!beforeId || !afterId || beforeId === afterId}
                onClick={() => void compare()}
              >
                Compare
              </Button>
            </div>
            {beforeId && afterId && beforeId === afterId && (
              <p className="mt-2 text-xs text-navy-500">Pick two different snapshots to compare.</p>
            )}
          </div>
        )}

        {comparison && (
          <div className="mt-5 animate-fade-up border-t border-navy-100 pt-4">
            <h4 className="text-xs font-semibold tracking-widest text-navy-500 uppercase">
              Comparison · {formatClockTime(comparison.before.createdAt)} →{' '}
              {formatClockTime(comparison.after.createdAt)}
            </h4>
            <div className="mt-2">
              <ComparisonTable rows={comparison.delta ?? []} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
