import clsx from 'clsx';

/**
 * Accessible 5-star rating. The wrapper carries the aria-label with the
 * numeric rating; individual stars are decorative (aria-hidden).
 */
export default function RatingStars({
  rating,
  reviewCount,
  className,
}: {
  rating: number;
  reviewCount?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  const label = `Rated ${clamped.toFixed(1)} out of 5${reviewCount ? ` from ${reviewCount} review${reviewCount === 1 ? '' : 's'}` : ''}`;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={clsx('inline-flex items-center gap-1', className)}
    >
      <span aria-hidden="true" className="inline-flex">
        {[0, 1, 2, 3, 4].map((index) => {
          const fill = Math.max(0, Math.min(1, clamped - index));
          return (
            <span key={index} className="relative inline-block size-3.5">
              {/* Empty star */}
              <svg viewBox="0 0 20 20" className="absolute inset-0 size-3.5 text-navy-200" fill="currentColor">
                <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" />
              </svg>
              {/* Partial fill */}
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <svg viewBox="0 0 20 20" className="size-3.5 text-teal-500" fill="currentColor">
                  <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" />
                </svg>
              </span>
            </span>
          );
        })}
      </span>
      <span className="text-xs font-medium text-navy-600 tabular-nums">{clamped.toFixed(1)}</span>
      {typeof reviewCount === 'number' && (
        <span className="text-xs text-navy-400">({reviewCount})</span>
      )}
    </span>
  );
}
