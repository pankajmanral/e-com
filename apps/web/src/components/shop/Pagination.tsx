import Link from 'next/link';
import clsx from 'clsx';

export interface PaginationProps {
  page: number;
  pages: number;
  /** Query builder that preserves all current filters. */
  hrefFor: (page: number) => string;
}

function pageNumbers(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const numbers = new Set<number>([1, pages, page]);
  if (page - 1 > 1) numbers.add(page - 1);
  if (page + 1 < pages) numbers.add(page + 1);
  const sorted = [...numbers].sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  let previous = 0;
  for (const number of sorted) {
    if (previous && number - previous > 1) out.push('gap');
    out.push(number);
    previous = number;
  }
  return out;
}

/** Prev/next + numbered pagination. Pure links — works without JavaScript. */
export default function Pagination({ page, pages, hrefFor }: PaginationProps) {
  if (pages <= 1) return null;

  const arrow = (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
      <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <nav aria-label="Product pages" className="mt-10 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-navy-200 px-3 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50"
        >
          {arrow}
          <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : (
        <span className="inline-flex h-10 cursor-not-allowed items-center gap-1 rounded-lg border border-navy-100 px-3 text-sm text-navy-300">
          {arrow}
          <span className="hidden sm:inline">Previous</span>
        </span>
      )}

      <ul className="flex items-center gap-1.5">
        {pageNumbers(page, pages).map((entry, index) =>
          entry === 'gap' ? (
            <li key={`gap-${index}`} className="px-1 text-sm text-navy-400" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={hrefFor(entry)}
                aria-current={entry === page ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                className={clsx(
                  'inline-flex size-10 items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors',
                  entry === page
                    ? 'bg-navy-900 text-white'
                    : 'border border-navy-200 text-navy-700 hover:bg-navy-50',
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
      </ul>

      {page < pages ? (
        <Link
          href={hrefFor(page + 1)}
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-navy-200 px-3 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50"
        >
          <span className="hidden sm:inline">Next</span>
          <svg viewBox="0 0 20 20" fill="none" className="size-4 rotate-180" aria-hidden="true">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ) : (
        <span className="inline-flex h-10 cursor-not-allowed items-center gap-1 rounded-lg border border-navy-100 px-3 text-sm text-navy-300">
          <span className="hidden sm:inline">Next</span>
          <svg viewBox="0 0 20 20" fill="none" className="size-4 rotate-180" aria-hidden="true">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </nav>
  );
}
