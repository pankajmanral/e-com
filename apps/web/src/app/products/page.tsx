import Link from 'next/link';
import { apiGet, ApiError } from '@/lib/api';
import type { Category, Product, ProductListResponse } from '@/lib/types';
import { categoryLabel } from '@/lib/format';
import ProductCard from '@/components/product/ProductCard';
import FilterSidebar from '@/components/shop/FilterSidebar';
import ShopToolbar from '@/components/shop/ShopToolbar';
import Pagination from '@/components/shop/Pagination';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function buildProductsQuery(params: {
  search: string | null;
  category: string | null;
  sort: string;
  page: number;
  perPage: number;
}): string {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.category) query.set('category', params.category);
  query.set('sort', params.sort);
  query.set('page', String(params.page));
  query.set('perPage', String(params.perPage));
  return query.toString();
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const search = first(sp.search);
  const category = first(sp.category);
  const sort = first(sp.sort) ?? 'featured';
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1);
  const perPage = 12;

  let products: Product[] = [];
  let total = 0;
  let pages = 1;
  let fetchError: ApiError | null = null;

  try {
    const data = await apiGet<ProductListResponse>('product',
      `/api/products?${buildProductsQuery({ search, category, sort, page, perPage })}`,
    );
    products = data.items ?? [];
    total = data.total ?? products.length;
    pages = Math.max(1, data.pages ?? 1);
  } catch (error) {
    fetchError = error instanceof ApiError ? error : null;
  }

  let categories: Category[] = [];
  try {
    categories = await apiGet<Category[]>('product', '/api/categories');
  } catch {
    categories = [];
  }

  const effectivePage = Math.min(page, pages);
  const hasFilters = Boolean(search || category || sort !== 'featured');

  const hrefFor = (targetPage: number): string => {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (category) query.set('category', category);
    if (sort !== 'featured') query.set('sort', sort);
    if (targetPage > 1) query.set('page', String(targetPage));
    const qs = query.toString();
    return qs ? `/products?${qs}` : '/products';
  };

  return (
    <div className="mx-auto max-w-7xl animate-fade-up px-4 py-8 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-2 text-sm text-navy-500">
        <Link href="/" className="transition-colors hover:text-teal-600">
          Home
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-navy-700">Shop</span>
      </div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-navy-900">
            {category ? categoryLabel(category) : 'All products'}
          </h1>
          <p className="mt-1.5 text-navy-600">
            {search ? (
              <>
                Results for <span className="font-medium text-navy-800">“{search}”</span>
              </>
            ) : (
              'Everyday tech, carefully chosen.'
            )}
          </p>
        </div>
      </div>

      <ShopToolbar resultCount={fetchError ? null : total} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr] lg:gap-10">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <FilterSidebar
            categories={categories}
            activeCategory={category}
            search={search}
            sort={sort}
          />
        </aside>

        {/* Mobile filter drawer */}
        <details className="group rounded-xl border border-navy-100 bg-white shadow-soft lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-navy-800 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                <path d="M3 5h14M6 10h8M8 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Filters
            </span>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="border-t border-navy-100 px-4 py-4">
            <FilterSidebar
              categories={categories}
              activeCategory={category}
              search={search}
              sort={sort}
            />
          </div>
        </details>

        {/* Results */}
        <section aria-label="Products" className="min-w-0">
          {fetchError ? (
            <ErrorBanner title="We could not load the catalogue">
              <p>{fetchError.message}</p>
              {fetchError.code === 'SERVICE_UNAVAILABLE' && (
                <p className="mt-1">
                  The product service (default{' '}
                  <code className="rounded bg-navy-800 px-1.5 py-0.5 font-mono text-xs text-teal-200">
                    http://localhost:4002
                  </code>
                  ) is not responding. Start the backend, then try again.
                </p>
              )}
              <Link
                href="/products"
                className="mt-3 inline-flex h-9 items-center rounded-lg bg-white px-4 text-sm font-medium text-navy-900 transition-colors hover:bg-navy-100"
              >
                Retry
              </Link>
            </ErrorBanner>
          ) : products.length === 0 ? (
            <EmptyState
              title="No products found"
              description={
                hasFilters
                  ? 'Try a different search term or clear your filters to see everything.'
                  : 'The catalogue is empty right now — check back soon.'
              }
              action={
                hasFilters ? (
                  <Link href="/products">
                    <Button type="button" variant="navy">
                      Clear filters
                    </Button>
                  </Link>
                ) : undefined
              }
              icon={
                <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            />
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <li key={product.id} className="h-full">
                    <ProductCard product={product} />
                  </li>
                ))}
              </ul>
              <Pagination page={effectivePage} pages={pages} hrefFor={hrefFor} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
