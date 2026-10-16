'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import ProductImage from '@/components/product/ProductImage';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/format';

const FREE_SHIPPING_THRESHOLD = 11_000;

/** Client view of the cart — state lives in the CartProvider (localStorage). */
export default function CartView() {
  const { items, mounted, subtotal, setQuantity, remove } = useCart();

  // Before hydration show a neutral skeleton-ish shell to avoid a flash of
  // the empty state for returning visitors.
  if (!mounted) {
    return (
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="flex gap-4 rounded-xl border border-navy-100 bg-white p-4 shadow-soft"
            >
              <div className="h-24 w-32 shrink-0 animate-pulse rounded-lg bg-navy-100/70" />
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 w-2/3 animate-pulse rounded bg-navy-100/70" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-navy-100/70" />
                <div className="h-8 w-32 animate-pulse rounded-lg bg-navy-100/70" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-navy-100/70" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Browse the collection and add something you love — your cart is saved locally between visits."
        action={
          <Link href="/products">
            <Button type="button" variant="teal">
              Browse the collection
            </Button>
          </Link>
        }
        icon={
          <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
            <path
              d="M4 6h2l2.4 10.2a1.6 1.6 0 0 0 1.6 1.3h7.2a1.6 1.6 0 0 0 1.6-1.3L20.5 9H7M10 20.5h.01M17 20.5h.01"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
      />
    );
  }

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 764.5;
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_20rem] lg:gap-12">
      {/* Line items */}
      <ul className="space-y-4" aria-label="Cart items">
        {items.map((item) => {
          const overStock = item.stock > 0 && item.quantity >= item.stock;
          return (
            <li
              key={item.productId}
              className="flex flex-col gap-4 rounded-xl border border-navy-100 bg-white p-4 shadow-soft sm:flex-row sm:items-center"
            >
              <Link
                href={`/products/${item.slug}`}
                className="w-full shrink-0 overflow-hidden rounded-lg border border-navy-100 sm:w-32"
                aria-label={`${item.name} — view details`}
              >
                <ProductImage src={item.image} alt={item.name} />
              </Link>

              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-navy-900">
                  <Link href={`/products/${item.slug}`} className="transition-colors hover:text-teal-600">
                    {item.name}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-navy-500 tabular-nums">
                  {formatPrice(item.price)} each
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {/* Quantity stepper */}
                  <div
                    className="inline-flex h-9 items-center rounded-lg border border-navy-200"
                    role="group"
                    aria-label={`Quantity for ${item.name}`}
                  >
                    <button
                      type="button"
                      onClick={() => setQuantity(item.productId, item.quantity - 1)}
                      aria-label={`Decrease quantity of ${item.name}`}
                      title="Decrease quantity"
                      className="flex size-9 items-center justify-center rounded-l-lg text-navy-700 transition-colors hover:bg-navy-50"
                    >
                      <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden="true">
                        <path d="M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                    <span className="w-9 text-center text-sm font-semibold text-navy-900 tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(item.productId, item.quantity + 1)}
                      disabled={overStock || item.stock === 0}
                      aria-label={`Increase quantity of ${item.name}`}
                      title={overStock ? 'Maximum available stock reached' : 'Increase quantity'}
                      className="flex size-9 items-center justify-center rounded-r-lg text-navy-700 transition-colors hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden="true">
                        <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  {overStock && (
                    <p className="text-xs font-medium text-teal-700">
                      Max stock reached ({item.stock} available)
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => remove(item.productId)}
                    aria-label={`Remove ${item.name} from cart`}
                    title="Remove from cart"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 transition-colors hover:text-navy-900"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                      <path
                        d="M4 6h12M8 6V4.8A.8.8 0 0 1 8.8 4h2.4a.8.8 0 0 1 .8.8V6m2.5 0-.6 10a1.2 1.2 0 0 1-1.2 1.1H7.3a1.2 1.2 0 0 1-1.2-1.1L5.5 6"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Remove
                  </button>
                </div>
              </div>

              <p className="text-base font-semibold text-navy-900 tabular-nums sm:text-right">
                {formatPrice(item.price * item.quantity)}
                <span className="mt-0.5 block text-xs font-normal text-navy-400 sm:text-right">
                  line total
                </span>
              </p>
            </li>
          );
        })}
      </ul>

      {/* Order summary */}
      <aside aria-label="Order summary" className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-navy-900">Order summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-navy-600">Subtotal</dt>
              <dd className="font-medium text-navy-900 tabular-nums">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-navy-600">Shipping estimate</dt>
              <dd className="font-medium text-navy-900 tabular-nums">
                {shipping === 0 ? 'Free' : formatPrice(shipping)}
              </dd>
            </div>
          </dl>

          {remainingForFreeShipping > 0 ? (
            <p className="mt-3 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-600">
              Add <span className="font-semibold text-navy-900">{formatPrice(remainingForFreeShipping)}</span> more
              to qualify for free shipping (free over ₹11,000).
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700">
              You have qualified for free shipping.
            </p>
          )}

          <p className="mt-3 text-xs text-navy-500">
            8% tax is calculated at checkout based on your shipping address.
          </p>

          <Link href="/checkout" className="mt-5 block">
            <Button type="button" variant="teal" size="lg" fullWidth>
              Proceed to checkout
            </Button>
          </Link>

          <p className="mt-3 text-center text-xs text-navy-400">
            Secure checkout · Card, PayPal or cash on delivery
          </p>
        </div>
      </aside>
    </div>
  );
}
