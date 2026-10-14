import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiGet, ApiError } from '@/lib/api';
import type { Product } from '@/lib/types';
import { formatPrice, categoryLabel } from '@/lib/format';
import ProductImage from '@/components/product/ProductImage';
import RatingStars from '@/components/product/RatingStars';
import AddToCartButton from '@/components/product/AddToCartButton';
import { Badge } from '@/components/ui/Badge';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

export const dynamic = 'force-dynamic';

async function getProduct(id: string): Promise<Product> {
  return apiGet<Product>('product', `/api/products/${encodeURIComponent(id)}`);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const product = await getProduct(id);
    return { title: product.name, description: product.description.slice(0, 160) };
  } catch {
    return { title: 'Product' };
  }
}

function StockBadge({ product }: { product: Product }) {
  if (product.stock === 0) {
    return <Badge variant="critical">Out of stock</Badge>;
  }
  if (product.stock <= 5) {
    return (
      <Badge variant="teal-soft">
        <svg viewBox="0 0 20 20" fill="none" className="size-3" aria-hidden="true">
          <path
            d="M10 7v4m0 3h.01M8.6 3.9 2.3 15a1.6 1.6 0 0 0 1.4 2.4h12.6a1.6 1.6 0 0 0 1.4-2.4L11.4 3.9a1.6 1.6 0 0 0-2.8 0Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Only {product.stock} left in stock
      </Badge>
    );
  }
  return <Badge variant="positive">In stock</Badge>;
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let product: Product;
  try {
    product = await getProduct(id);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    const message =
      error instanceof ApiError ? error.message : 'The product could not be loaded.';
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <ErrorBanner title="We could not load this product">
          <p>{message}</p>
        </ErrorBanner>
        <Link
          href="/products"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white transition-colors hover:bg-navy-800"
        >
          Back to shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-up px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-navy-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="transition-colors hover:text-teal-600">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/products" className="transition-colors hover:text-teal-600">
              Shop
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={`/products?category=${encodeURIComponent(product.category)}`}
              className="transition-colors hover:text-teal-600"
            >
              {categoryLabel(product.category)}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-navy-800">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
        {/* Image */}
        <div className="overflow-hidden rounded-xl border border-navy-100 shadow-soft">
          <ProductImage src={product.image} alt={product.name} eager />
        </div>

        {/* Details */}
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-navy-400 uppercase">
            {categoryLabel(product.category)}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance text-navy-900 sm:text-4xl">
            {product.name}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <RatingStars rating={product.rating} reviewCount={product.reviewCount} className="[&>span>span>span]:size-4" />
            <StockBadge product={product} />
          </div>

          <p className="mt-6 text-3xl font-semibold text-navy-900 tabular-nums">
            {formatPrice(product.price, product.currency)}
          </p>

          <p className="mt-5 leading-relaxed text-navy-700">{product.description}</p>

          {product.tags.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Product tags">
              {product.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-navy-200 bg-navy-50 px-3 py-1 text-xs font-medium text-navy-600"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8">
            <AddToCartButton
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name,
                price: product.price,
                currency: product.currency,
                image: product.image,
                stock: product.stock,
              }}
            />
          </div>

          {/* Delivery / returns */}
          <div className="mt-10 grid grid-cols-1 gap-4 rounded-xl border border-navy-100 bg-navy-50/60 p-5 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-600 shadow-soft">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4" aria-hidden="true">
                  <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-navy-900">Delivery</h2>
                <p className="mt-1 text-sm leading-relaxed text-navy-600">
                  Arrives in 3–5 working days. Free tracked shipping on orders over £100,
                  otherwise £6.95.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-600 shadow-soft">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4" aria-hidden="true">
                  <path d="M4 9a8 8 0 1 1-.6 5M4 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-navy-900">Returns</h2>
                <p className="mt-1 text-sm leading-relaxed text-navy-600">
                  30-day returns on unopened items, plus a 2-year warranty covering parts and
                  labour.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
