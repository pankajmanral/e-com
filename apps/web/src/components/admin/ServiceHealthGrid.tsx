'use client';

import clsx from 'clsx';
import type { Health, HealthStatus } from '@/lib/types';
import { Skeleton } from '@/components/ui/Skeleton';

const statusStyles: Record<HealthStatus, { dot: string; label: string; text: string }> = {
  up: { dot: 'bg-teal-500', label: 'Up', text: 'text-teal-700' },
  degraded: { dot: 'bg-navy-400', label: 'Degraded', text: 'text-navy-600' },
  down: { dot: 'bg-navy-900', label: 'Down', text: 'text-navy-900' },
};

/**
 * One card per service. Clicking a card filters the metric charts to it
 * (click again to clear the filter).
 */
export default function ServiceHealthGrid({
  health,
  loading,
  selectedService,
  onSelect,
}: {
  health: Health | null;
  loading: boolean;
  selectedService: string | null;
  onSelect: (service: string | null) => void;
}) {
  if (loading && !health) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-6 w-24" />
            <Skeleton className="mt-3 h-3 w-44" />
          </div>
        ))}
      </div>
    );
  }

  const services = health?.services ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => {
        const meta = statusStyles[service.status] ?? statusStyles.degraded;
        const selected = selectedService === service.name;
        return (
          <button
            key={service.name}
            type="button"
            onClick={() => onSelect(selected ? null : service.name)}
            aria-pressed={selected}
            aria-label={`${service.name}: ${meta.label}, latency ${service.latencyMs}ms. ${selected ? 'Clear chart filter' : 'Filter charts to this service'}`}
            className={clsx(
              'rounded-xl border bg-white p-5 text-left shadow-soft transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500',
              selected
                ? 'border-teal-500 ring-1 ring-teal-500'
                : 'border-navy-100 hover:-translate-y-0.5 hover:border-navy-200',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-mono text-sm font-semibold text-navy-900">{service.name}</h3>
              <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', meta.text)}>
                <span className={clsx('size-2 rounded-full', meta.dot)} aria-hidden="true" />
                {meta.label}
              </span>
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-navy-500">Latency</dt>
                <dd className="font-medium text-navy-900 tabular-nums">{service.latencyMs} ms</dd>
              </div>
              {service.version && (
                <div className="flex items-center justify-between">
                  <dt className="text-navy-500">Version</dt>
                  <dd className="font-mono text-xs font-medium text-navy-700">{service.version}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="shrink-0 text-navy-500">Base URL</dt>
                <dd className="truncate font-mono text-xs text-navy-500" title={service.baseUrl}>
                  {service.baseUrl}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-xs text-navy-400">
              {selected ? 'Charts filtered — click to clear' : 'Click to filter charts'}
            </p>
          </button>
        );
      })}
    </div>
  );
}
