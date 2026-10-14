import clsx, { type ClassValue } from 'clsx';
import type { ReactNode } from 'react';

export type BadgeVariant = 'positive' | 'neutral' | 'critical' | 'outline' | 'teal-soft';

const styles: Record<BadgeVariant, string> = {
  positive: 'bg-teal-600 text-white',
  neutral: 'bg-navy-900 text-white',
  // Errors keep to the palette: navy-900 + white + inline alert icon.
  critical: 'bg-navy-900 text-white',
  outline: 'border border-navy-200 bg-white text-navy-700',
  'teal-soft': 'bg-teal-50 text-teal-700 border border-teal-200',
};

export interface BadgeProps {
  variant?: BadgeVariant;
  className?: ClassValue;
  children: ReactNode;
  /** Optional leading dot, useful for status pills. */
  dot?: boolean;
}

export function Badge({ variant = 'neutral', className, children, dot }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        styles[variant],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />}
      {children}
    </span>
  );
}
