'use client';

import clsx from 'clsx';
import type { ComparisonRow } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';

/** Metrics where a decrease is an improvement. */
const LOWER_IS_BETTER = new Set([
  'errorRate',
  'totalErrors',
  'p95LatencyMs',
  'latencyMs',
  'error_rate',
]);

function metricLabel(metric: string): string {
  const labels: Record<string, string> = {
    requestsPerSec: 'Requests/sec',
    errorRate: 'Error rate',
    p95LatencyMs: 'p95 latency',
    totalRequests: 'Total requests',
    totalErrors: 'Total errors',
  };
  return labels[metric] ?? metric;
}

function formatMetric(metric: string, value: number): string {
  if (metric === 'errorRate') return formatPercent(value, 2);
  if (metric === 'p95LatencyMs') return `${formatNumber(value, 0)} ms`;
  if (metric === 'requestsPerSec') return formatNumber(value, 2);
  return formatNumber(value, 0);
}

/**
 * Comparison grid for two snapshots: per service × metric, before → after
 * with signed delta. Improvements render teal, regressions navy-900 with an
 * arrow (staying inside the palette).
 */
export default function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-navy-200 bg-navy-50/50 px-4 py-8 text-center text-sm text-navy-500">
        The comparison returned no metric deltas.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">
          Metric comparison between the selected before and after snapshots
        </caption>
        <thead>
          <tr className="border-b border-navy-100 text-left text-xs tracking-wider text-navy-500 uppercase">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Service
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Metric
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">
              Before
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">
              After
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Delta
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const lowerBetter = LOWER_IS_BETTER.has(row.metric);
            const improved = lowerBetter ? row.delta < 0 : row.delta > 0;
            const neutral = row.delta === 0;
            const up = row.delta > 0;

            return (
              <tr key={`${row.service}-${row.metric}-${index}`} className="border-b border-navy-50 last:border-0">
                <th scope="row" className="py-2.5 pr-3 text-left font-mono text-xs font-medium text-navy-800">
                  {row.service}
                </th>
                <td className="py-2.5 pr-3 text-navy-600">{metricLabel(row.metric)}</td>
                <td className="py-2.5 pr-3 text-right text-navy-700 tabular-nums">
                  {formatMetric(row.metric, row.before)}
                </td>
                <td className="py-2.5 pr-3 text-right font-medium text-navy-900 tabular-nums">
                  {formatMetric(row.metric, row.after)}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1 font-semibold',
                      neutral && 'text-navy-500',
                      !neutral && improved && 'text-teal-600',
                      !neutral && !improved && 'text-navy-900',
                    )}
                    title={neutral ? 'No change' : improved ? 'Improvement' : 'Regression'}
                  >
                    {!neutral && (
                      <svg viewBox="0 0 12 12" fill="none" className="size-3" aria-hidden="true">
                        <path
                          d={up ? 'M6 2v8M3 5l3-3 3 3' : 'M6 10V2M3 7l3 3 3-3'}
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {row.delta > 0 ? '+' : ''}
                    {formatMetric(row.metric, row.delta)}
                    {typeof row.deltaPct === 'number' && (
                      <span className="ml-1 text-xs font-normal text-navy-400">
                        ({row.deltaPct > 0 ? '+' : ''}
                        {row.deltaPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                  <span className="sr-only">
                    {neutral ? 'no change' : improved ? 'improvement' : 'regression'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
