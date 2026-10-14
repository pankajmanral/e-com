import clsx, { type ClassValue } from 'clsx';

export interface SpinnerProps {
  className?: ClassValue;
  label?: string;
}

export function Spinner({ className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <svg className={clsx('size-5 animate-spin text-teal-600', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
