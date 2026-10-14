import clsx, { type ClassValue } from 'clsx';
import type { ReactNode } from 'react';

export interface ErrorBannerProps {
  title?: string;
  children?: ReactNode;
  className?: ClassValue;
}

/**
 * Error banner kept inside the palette: navy-900 surface, white text,
 * inline SVG alert icon. No red/amber — per the design system.
 */
export function ErrorBanner({ title = 'Something went wrong', children, className }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={clsx(
        'flex items-start gap-3 rounded-xl bg-navy-900 px-4 py-3.5 text-white shadow-soft',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="mt-0.5 size-5 shrink-0 text-teal-300"
        aria-hidden="true"
      >
        <path
          d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-navy-100">{children}</div>}
      </div>
    </div>
  );
}
