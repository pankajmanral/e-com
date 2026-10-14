import Link from 'next/link';
import type { Product } from '@/lib/types';
import { formatPrice, categoryLabel } from '@/lib/format';
import ProductImage from './ProductImage';
import RatingStars from './RatingStars';
import QuickAddButton from './QuickAddButton';

/**
 * Product card. The whole card links to the detail page; the quick-add
 * button stops propagation. Server component wrapping one client leaf.
 */
export default function ProductCard({ product }: { product: Product }) {
  const lowStock = product.stock > 0 && product.stock <= 5;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-navy-100 bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-lg">
      <Link
        href={`/products/${product.slug}`}
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
        aria-label={`${product.name} — view details`}
      >
        <ProductImage src={product.image} alt={product.name} className="transition-transform duration-500 group-hover:scale-[1.03]" />
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[11px] font-semibold tracking-widest text-navy-400 uppercase">
          {categoryLabel(product.category)}
        </p>
        <h3 className="text-sm font-semibold text-navy-900">
          <Link
            href={`/products/${product.slug}`}
            className="transition-colors hover:text-teal-600"
          >
            {product.name}
          </Link>
        </h3>
        <RatingStars rating={product.rating} reviewCount={product.reviewCount} />

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            <p className="text-base font-semibold text-navy-900 tabular-nums">
              {formatPrice(product.price, product.currency)}
            </p>
            {product.stock === 0 ? (
              <p className="text-xs font-medium text-navy-500">Out of stock</p>
            ) : lowStock ? (
              <p className="text-xs font-medium text-teal-700">Only {product.stock} left</p>
            ) : (
              <p className="text-xs text-navy-400">In stock</p>
            )}
          </div>
          <QuickAddButton
            product={{
              id: product.id,
              slug: product.slug,
              name: product.name,
              price: product.price,
              image: product.image,
              stock: product.stock,
            }}
          />
        </div>
      </div>
    </article>
  );
}
