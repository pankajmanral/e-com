'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import clsx from 'clsx';
import type { MetricWindow } from './AdminDashboard';
import type { MetricsHistoryResponse, MetricsResponse } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

/** Palette cycle for per-service lines — navy + teal only. */
const LINE_COLORS = ['#14a898', '#26488a', '#0f6e65', '#5a81c6', '#12264a'];

const WINDOWS: MetricWindow[] = ['5m', '15m', '30m'];

type Row = Record<string, number | null>;

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Merge per-service series into a single time-keyed table for recharts. */
function buildRows(
  history: MetricsHistoryResponse | null,
  selectedService: string | null,
  metric: 'requestsPerSec' | 'errorRate' | 'p95LatencyMs',
): { rows: Row[]; services: string[] } {
  if (!history?.series?.length) return { rows: [], services: [] };

  const series = history.series.filter(
    (entry) =>
      entry.points.length > 0 &&
      (!selectedService || entry.service === selectedService),
  );
  if (series.length === 0) return { rows: [], services: [] };

  const timestamps = new Set<number>();
  const maps = series.map((entry) => {
    const map = new Map<number, number>();
    for (const point of entry.points) {
      const ms = new Date(point.t).getTime();
      if (Number.isNaN(ms)) continue;
      map.set(ms, metric === 'errorRate' ? point[metric] * 100 : point[metric]);
      timestamps.add(ms);
    }
    return { service: entry.service, map };
  });

  const sorted = [...timestamps].sort((a, b) => a - b);
  const rows: Row[] = sorted.map((ms) => {
    const row: Row = { t: ms };
    for (const { service, map } of maps) {
      row[service] = map.get(ms) ?? null;
    }
    return row;
  });

  return { rows, services: maps.map((entry) => entry.service) };
}

function MetricTooltip(props: TooltipContentProps) {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-950 px-3 py-2 shadow-soft">
      <p className="mb-1 text-[11px] font-medium text-navy-300">
        {typeof label === 'number' ? formatTime(label) : String(label ?? '')}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="font-mono text-navy-200">{String(entry.dataKey)}</span>
            <span className="ml-auto pl-3 font-mono font-semibold text-teal-300 tabular-nums">
              {typeof entry.value === 'number' ? formatNumber(entry.value, 1) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
      <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
      <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>
      <div className="mt-4 h-56">{children}</div>
    </div>
  );
}

function Legend({ services }: { services: string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {services.map((service, index) => (
        <li key={service} className="inline-flex items-center gap-1.5 text-xs text-navy-600">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: LINE_COLORS[index % LINE_COLORS.length] }}
            aria-hidden="true"
          />
          <span className="font-mono">{service}</span>
        </li>
      ))}
    </ul>
  );
}

const axisTick = { fill: '#0b1b36', fontSize: 11 };

/**
 * Three live charts (requests/sec, error rate %, p95 latency) built from the
 * ops metrics history, with a 5m/15m/30m window selector and source badge.
 */
export default function MetricCharts({
  history,
  metrics,
  window: windowValue,
  onWindowChange,
  selectedService,
  onSelectService,
  loading,
}: {
  history: MetricsHistoryResponse | null;
  metrics: MetricsResponse | null;
  window: MetricWindow;
  onWindowChange: (window: MetricWindow) => void;
  selectedService: string | null;
  onSelectService: (service: string | null) => void;
  loading: boolean;
}) {
  const rps = useMemo(() => buildRows(history, selectedService, 'requestsPerSec'), [history, selectedService]);
  const errors = useMemo(() => buildRows(history, selectedService, 'errorRate'), [history, selectedService]);
  const latency = useMemo(() => buildRows(history, selectedService, 'p95LatencyMs'), [history, selectedService]);

  const noData = rps.rows.length === 0;
  const source = history?.source ?? metrics?.source ?? null;

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-navy-900">Live metrics</h2>
          {source && (
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                source === 'prometheus'
                  ? 'border-teal-200 bg-teal-50 text-teal-700'
                  : 'border-navy-200 bg-navy-50 text-navy-600',
              )}
            >
              source: {source === 'prometheus' ? 'prometheus' : 'in-process scrape'}
            </span>
          )}
          {selectedService && (
            <button
              type="button"
              onClick={() => onSelectService(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-navy-900 bg-navy-900 px-2.5 py-0.5 text-xs font-medium text-white transition-colors hover:bg-navy-800"
              aria-label={`Clear filter: ${selectedService}`}
            >
              {selectedService}
              <svg viewBox="0 0 20 20" fill="none" className="size-3" aria-hidden="true">
                <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <Select
          label="Time window"
          hideLabel
          value={windowValue}
          containerClassName="w-40"
          onChange={(event) => onWindowChange(event.target.value as MetricWindow)}
        >
          {WINDOWS.map((option) => (
            <option key={option} value={option}>
              Last {option}
            </option>
          ))}
        </Select>
      </div>

      {loading && noData ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-xl border border-navy-100 p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-44" />
              <Skeleton className="mt-4 h-56 w-full" />
            </div>
          ))}
        </div>
      ) : noData ? (
        <div className="mt-4">
          <EmptyState
            title="No metric data yet"
            description={
              selectedService
                ? `No samples for ${selectedService} in the last ${windowValue}.`
                : `No samples in the last ${windowValue}. The ops service emits samples as traffic flows — try browsing the storefront, or widen the window.`
            }
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
                <path d="M4 17l4-6 4 3 4-8 4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard title="Requests / sec" subtitle="Throughput per service">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rps.rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="fill-teal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14a898" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#14a898" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef3fa" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatTime}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: '#d9e3f4' }}
                    minTickGap={48}
                  />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={(tooltipProps) => <MetricTooltip {...tooltipProps} />} cursor={{ stroke: '#b3c7e9' }} />
                  {rps.services.map((service, index) => (
                    <Area
                      key={service}
                      type="monotone"
                      dataKey={service}
                      stroke={LINE_COLORS[index % LINE_COLORS.length]}
                      strokeWidth={2}
                      fill={index === 0 ? 'url(#fill-teal)' : 'transparent'}
                      connectNulls
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Error rate" subtitle="Percentage of failed requests">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={errors.rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="#eef3fa" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatTime}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: '#d9e3f4' }}
                    minTickGap={48}
                  />
                  <YAxis
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(value: number) => `${formatPercent(value / 100, 0)}`}
                  />
                  <Tooltip
                    content={(tooltipProps) => <MetricTooltip {...tooltipProps} />}
                    cursor={{ stroke: '#b3c7e9' }}
                    formatter={(value) =>
                      typeof value === 'number' ? [`${formatPercent(value / 100, 2)}`, 'error rate'] : [value, 'error rate']
                    }
                  />
                  {errors.services.map((service, index) => (
                    <Line
                      key={service}
                      type="monotone"
                      dataKey={service}
                      stroke={LINE_COLORS[index % LINE_COLORS.length]}
                      strokeWidth={2}
                      connectNulls
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="p95 latency" subtitle="95th percentile, milliseconds">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latency.rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="#eef3fa" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatTime}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: '#d9e3f4' }}
                    minTickGap={48}
                  />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} unit="ms" />
                  <Tooltip content={(tooltipProps) => <MetricTooltip {...tooltipProps} />} cursor={{ stroke: '#b3c7e9' }} />
                  {latency.services.map((service, index) => (
                    <Line
                      key={service}
                      type="monotone"
                      dataKey={service}
                      stroke={LINE_COLORS[index % LINE_COLORS.length]}
                      strokeWidth={2}
                      connectNulls
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <Legend services={rps.services} />
        </>
      )}
    </div>
  );
}
