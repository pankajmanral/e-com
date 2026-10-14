import Link from 'next/link';
import type { Category } from '@/lib/types';
import { formatPrice } from '@/lib/format';
import clsx, { type ClassValue } from 'clsx';

export interface FilterSidebarProps {
  categories: Category[];
  activeCategory: string | null;
  search: string | null;
  sort: string;
  className?: ClassValue;
}

function hrefFor(
  category: { slug: string } | null,
  search: string | null,
  sort: string,
): string {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category) params.set('category', category.slug);
  if (sort && sort !== 'featured') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `/products?${qs}` : '/products';
}

/**
 * Category filter list. Pure links — the URL is the source of truth, so
 * filters work without JavaScript and update via client-side navigation.
 */
export default function FilterSidebar({ categories, activeCategory, search, sort, className }: FilterSidebarProps) {
  return (
    <div className={clsx('space-y-8', className)}>
      <nav aria-label="Filter by category">
        <h2 className="text-xs font-semibold tracking-widest text-navy-500 uppercase">Categories</h2>
        <ul className="mt-3 space-y-1">
          <li>
            <Link
              href={hrefFor(null, search, sort)}
              aria-current={activeCategory === null ? 'true' : undefined}
              className={clsx(
                'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                activeCategory === null
                  ? 'bg-navy-900 font-medium text-white'
                  : 'text-navy-700 hover:bg-navy-50',
              )}
            >
              All products
            </Link>
          </li>
          {categories.map((category) => {
            const active = activeCategory === category.slug;
            return (
              <li key={category.slug}>
                <Link
                  href={hrefFor(category, search, sort)}
                  aria-current={active ? 'true' : undefined}
                  className={clsx(
                    'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-navy-900 font-medium text-white'
                      : 'text-navy-700 hover:bg-navy-50',
                  )}
                >
                  <span>{category.name}</span>
                  <span
                    className={clsx(
                      'text-xs tabular-nums',
                      active ? 'text-teal-200' : 'text-navy-400',
                    )}
                  >
                    {category.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {categories.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold tracking-widest text-navy-500 uppercase">
            Price range
          </h2>
          <ul className="mt-3 space-y-2.5 px-3 text-sm text-navy-600">
            {categories
              .filter((category) => activeCategory === null || category.slug === activeCategory)
              .map((category) => (
                <li key={category.slug} className="flex items-center justify-between gap-2">
                  <span className="truncate">{category.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-navy-500">
                    {formatPrice(category.priceRange.min)} – {formatPrice(category.priceRange.max)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {(activeCategory || search) && (
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50"
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
            <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Clear filters
        </Link>
      )}
    </div>
  );
}
