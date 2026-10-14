import clsx, { type ClassValue } from 'clsx';
import type { ReactNode } from 'react';

export interface CardProps {
  className?: ClassValue;
  children: ReactNode;
  /** Renders the card as a clickable/selectable surface (adds hover affordances). */
  interactive?: boolean;
}

export function Card({ className, children, interactive }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-navy-100 bg-white shadow-soft',
        interactive && 'card-lift hover:border-navy-200',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-100 px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-navy-900">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-navy-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: ClassValue; children: ReactNode }) {
  return <div className={clsx('px-5 py-4', className)}>{children}</div>;
}
