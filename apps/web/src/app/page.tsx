import Link from 'next/link';
import { apiGet, ApiError } from '@/lib/api';
import type { Category, Product, ProductListResponse } from '@/lib/types';
import { formatPrice } from '@/lib/format';
import ProductCard from '@/components/product/ProductCard';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

export const dynamic = 'force-dynamic';

const features = [
  {
    title: 'Free shipping over ₹11,000',
    body: 'Tracked delivery across India on every order above ₹11,000. Standard delivery ₹764.50 otherwise.',
    icon: (
      <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7zM7 20a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 7 20Zm11 0a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z" />
    ),
  },
  {
    title: '30-day returns',
    body: 'Changed your mind? Send it back within 30 days for a full refund, no fuss.',
    icon: <path d="M4 9a8 8 0 1 1-.6 5M4 4v5h5" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: '2-year warranty',
    body: 'Every product is covered for two years — parts and labour, handled by us.',
    icon: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Zm-3 9 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

async function getFeaturedProducts(): Promise<Product[]> {
  const data = await apiGet<ProductListResponse>('product', '/api/products?sort=featured&perPage=4');
  return data.items ?? [];
}

async function getCategories(): Promise<Category[]> {
  return apiGet<Category[]>('product', '/api/categories');
}

function ServiceDownHint() {
  return (
    <ErrorBanner title="The product service is offline">
      <p>
        We could not reach the catalogue. Start the backend with{' '}
        <code className="rounded bg-navy-800 px-1.5 py-0.5 font-mono text-xs text-teal-200">
          npm run dev
        </code>{' '}
        from the repository root, then reload.
      </p>
    </ErrorBanner>
  );
}

export default async function HomePage() {
  const [featuredResult, categoriesResult] = await Promise.allSettled([
    getFeaturedProducts(),
    getCategories(),
  ]);

  const featured = featuredResult.status === 'fulfilled' ? featuredResult.value : [];
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value : [];
  const catalogueDown = featuredResult.status === 'rejected';

  return (
    <div className="animate-fade-up">
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        {/* Decorative gradient wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-32 size-[32rem] rounded-full bg-teal-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-navy-500/30 blur-3xl"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-500/10 px-3 py-1 text-xs font-medium tracking-wide text-teal-300 uppercase">
            <span className="size-1.5 rounded-full bg-teal-400" aria-hidden="true" />
            Observable by design
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Everyday tech, carefully chosen.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-navy-200">
            A curated collection of audio, wearables and accessories — served by a
            service-mesh-native platform where every request is traced, measured and engineered
            to survive failure.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/products"
              className="inline-flex h-12 items-center rounded-lg bg-teal-600 px-6 text-base font-medium text-white shadow-soft transition-colors hover:bg-teal-700"
            >
              Browse the collection
            </Link>
            <Link
              href="/admin"
              className="inline-flex h-12 items-center gap-2 px-2 text-base font-medium text-teal-300 transition-colors hover:text-teal-200"
            >
              View resilience lab
              <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Feature strip                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section aria-label="Shopping benefits" className="border-b border-navy-100 bg-navy-50/60">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-px overflow-hidden bg-navy-100 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="flex items-start gap-4 bg-navy-50/60 px-6 py-6">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-teal-600 shadow-soft">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5" aria-hidden="true">
                  {feature.icon}
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-navy-900">{feature.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-navy-600">{feature.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Featured products                                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-navy-900">Featured products</h2>
            <p className="mt-1.5 text-navy-600">Hand-picked favourites, rated by the community.</p>
          </div>
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 transition-colors hover:text-teal-700"
          >
            View all products
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {catalogueDown ? (
          <ServiceDownHint />
        ) : featured.length === 0 ? (
          <p className="rounded-xl border border-dashed border-navy-200 bg-navy-50/50 px-6 py-12 text-center text-sm text-navy-600">
            No featured products right now — check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Category tiles                                                    */}
      {/* ---------------------------------------------------------------- */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight text-navy-900">Shop by category</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className="group card-lift flex items-center justify-between rounded-xl border border-navy-100 bg-white p-6 shadow-soft hover:border-teal-300"
              >
                <div>
                  <h3 className="text-base font-semibold text-navy-900 group-hover:text-teal-700">
                    {category.name}
                  </h3>
                  <p className="mt-1 text-sm text-navy-500">
                    {category.count} product{category.count === 1 ? '' : 's'}
                    {category.priceRange && (
                      <>
                        {' · '}
                        {formatPrice(category.priceRange.min)} – {formatPrice(category.priceRange.max)}
                      </>
                    )}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-full bg-navy-50 text-navy-700 transition-colors group-hover:bg-teal-50 group-hover:text-teal-600">
                  <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                    <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Observability band                                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-navy-950 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-xs font-semibold tracking-widest text-teal-300 uppercase">
              Powered by observability
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Every order is a distributed trace.
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-navy-300">
              This storefront runs on independently deployable microservices behind a service
              mesh. Each request carries an OpenTelemetry context across the user, product and
              order services — so latency and errors can be traced end-to-end in Jaeger and
              charted live in Grafana.
            </p>
            <Link
              href="/admin"
              className="mt-7 inline-flex h-11 items-center rounded-lg bg-teal-600 px-5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-teal-700"
            >
              Explore the resilience lab
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { term: 'Distributed tracing', detail: 'W3C traceparent propagated through every service hop, viewable in Jaeger.' },
              { term: 'Live metrics', detail: 'Requests/sec, error rate and p95 latency scraped into Prometheus.' },
              { term: 'Health probes', detail: 'Continuous liveness and latency checks across all services.' },
              { term: 'Chaos experiments', detail: 'Controlled fault injection against the local lab to validate resilience.' },
            ].map((item) => (
              <li key={item.term} className="rounded-xl border border-navy-800 bg-navy-900/60 p-5">
                <h3 className="text-sm font-semibold text-white">{item.term}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-300">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
