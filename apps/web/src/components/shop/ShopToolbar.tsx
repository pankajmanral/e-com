'use client';

/**
 * Search + sort toolbar for the shop. Both update the URL via the router
 * (no full page reload) and reset pagination when filters change.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/Select';

const sortOptions = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
];

function buildQuery(params: URLSearchParams, overrides: Record<string, string | null>): string {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `?${qs}` : '';
}

export default function ShopToolbar({ resultCount }: { resultCount: number | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');

  const sort = searchParams.get('sort') ?? 'featured';

  // Keep the input in sync when the URL changes externally (back/forward).
  useEffect(() => {
    setSearch(searchParams.get('search') ?? '');
  }, [searchParams]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.replace(`/products${buildQuery(searchParams, { search: search.trim(), page: null })}`, {
      scroll: false,
    });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <form onSubmit={submitSearch} role="search" className="w-full sm:max-w-sm">
        <label htmlFor="shop-search" className="sr-only">
          Search products
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-navy-400"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            id="shop-search"
            type="search"
            name="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products…"
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-navy-200 bg-white pr-3 pl-9 text-sm text-navy-800 placeholder:text-navy-400 hover:border-navy-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
          />
        </div>
      </form>

      <div className="flex flex-wrap items-end gap-4">
        {resultCount !== null && (
          <p className="pb-2 text-sm text-navy-600 tabular-nums" aria-live="polite">
            {resultCount} result{resultCount === 1 ? '' : 's'}
          </p>
        )}
        <Select
          label="Sort by"
          hideLabel
          value={sort}
          containerClassName="min-w-48"
          onChange={(event) => {
            router.replace(
              `/products${buildQuery(searchParams, { sort: event.target.value, page: null })}`,
              { scroll: false },
            );
          }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
