'use client';

import clsx from 'clsx';
import type { Health, OpsStatus, OverallHealth } from '@/lib/types';
import { Skeleton } from '@/components/ui/Skeleton';

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'teal' | 'navy' | 'muted' | 'critical';
}) {
  const tones = {
    teal: 'border-teal-200 bg-teal-50 text-teal-700',
    navy: 'border-navy-200 bg-navy-50 text-navy-700',
    muted: 'border-navy-200 bg-white text-navy-500',
    critical: 'border-navy-900 bg-navy-900 text-white',
  } as const;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap',
        tones[tone],
      )}
    >
      <span className="text-[10px] font-semibold tracking-widest uppercase opacity-70">{label}</span>
      <span aria-hidden="true" className="opacity-40">
        ·
      </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

const overallMeta: Record<OverallHealth, { label: string; dot: string; pill: 'teal' | 'navy' | 'critical' }> = {
  healthy: { label: 'All systems operational', dot: 'bg-teal-500', pill: 'teal' },
  degraded: { label: 'Degraded performance', dot: 'bg-navy-400', pill: 'navy' },
  critical: { label: 'Critical — service failure', dot: 'bg-navy-900', pill: 'critical' },
};

/** Top strip: environment mode, chaos guard, metrics source, overall status. */
export default function StatusStrip({
  status,
  health,
  loading,
}: {
  status: OpsStatus | null;
  health: Health | null;
  loading: boolean;
}) {
  if (loading && !status && !health) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-100 bg-white p-4 shadow-soft">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-36" />
        ))}
      </div>
    );
  }

  const overall = health?.overall ?? 'degraded';
  const meta = overallMeta[overall];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-navy-100 bg-white p-4 shadow-soft">
      {/* Environment mode */}
      <Pill
        label="Mode"
        value={status?.mode === 'k8s' ? 'KUBERNETES MESH' : 'LOCAL LAB'}
        tone={status?.mode === 'k8s' ? 'navy' : 'teal'}
      />

      {/* Chaos guard */}
      <Pill
        label="Chaos"
        value={status?.chaosEnabled ? 'ENABLED' : 'DISABLED'}
        tone={status?.chaosEnabled ? 'teal' : 'muted'}
      />

      {/* Metrics source */}
      <Pill
        label="Metrics"
        value={
          status?.prometheus.available
            ? `PROMETHEUS${status.prometheus.url ? ` · ${status.prometheus.url}` : ''}`
            : 'IN-PROCESS SCRAPE'
        }
        tone={status?.prometheus.available ? 'navy' : 'muted'}
      />

      {/* Cluster context */}
      {status?.clusterContext && (
        <span
          className="inline-flex max-w-64 items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-3 py-1 text-xs text-navy-600"
          title={`Cluster context: ${status.clusterContext}`}
        >
          <span className="text-[10px] font-semibold tracking-widest text-navy-400 uppercase">ctx</span>
          <code className="truncate font-mono">{status.clusterContext}</code>
        </span>
      )}

      {/* Overall status */}
      <span
        className={clsx(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
          overallMeta[overall].pill === 'teal' && 'border-teal-200 bg-teal-50 text-teal-700',
          overallMeta[overall].pill === 'navy' && 'border-navy-200 bg-navy-50 text-navy-700',
          overallMeta[overall].pill === 'critical' && 'border-navy-900 bg-navy-900 text-white',
        )}
        aria-live="polite"
      >
        <span className={clsx('size-2 rounded-full', meta.dot)} aria-hidden="true" />
        {meta.label}
      </span>
    </div>
  );
}
