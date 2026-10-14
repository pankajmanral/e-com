import clsx, { type ClassValue } from 'clsx';
import type { ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Small secondary line under the value. */
  hint?: ReactNode;
  /** Optional trailing element (badge, icon). */
  trailing?: ReactNode;
  className?: ClassValue;
}

/** Compact KPI card used across the admin dashboard. */
export function StatCard({ label, value, hint, trailing, className }: StatCardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-navy-100 bg-white px-4 py-3.5 shadow-soft',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-navy-500 uppercase">{label}</p>
        {trailing}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-navy-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-navy-500">{hint}</p>}
    </div>
  );
}
