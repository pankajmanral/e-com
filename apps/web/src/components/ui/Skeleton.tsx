import clsx, { type ClassValue } from 'clsx';

export interface SkeletonProps {
  className?: ClassValue;
}

/** Loading placeholder block. Skeletons mirror the final layout to avoid CLS. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx('animate-pulse rounded-lg bg-navy-100/70', className)}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: ClassValue }) {
  return (
    <div className={clsx('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={clsx('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
