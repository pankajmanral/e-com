import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiGet, ApiError } from '@/lib/api';
import type { Order } from '@/lib/types';
import { formatPrice, formatClockTime } from '@/lib/format';
import ProductImage from '@/components/product/ProductImage';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Order confirmation' };

async function getOrder(id: string): Promise<Order> {
  return apiGet<Order>('order', `/api/orders/${encodeURIComponent(id)}`);
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-8 text-white" aria-hidden="true">
      <path
        d="m5 12.5 5 5 9-11"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TracePanel({ traceId }: { traceId: string }) {
  const jaegerBase = (process.env.JAEGER_URL ?? 'http://localhost:16686').replace(/\/$/, '');
  return (
    <section
      aria-labelledby="trace-heading"
      className="rounded-xl border border-navy-800 bg-navy-950 p-6 text-navy-100 shadow-soft"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-navy-900 text-teal-300">
          <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
            <path
              d="M4 12h4m8 0h4M12 4v4m0 8v4M7 7l2.5 2.5M17 7l-2.5 2.5M7 17l2.5-2.5M17 17l-2.5-2.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <h2 id="trace-heading" className="text-base font-semibold text-white">
          Distributed trace
        </h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-navy-300">
        This order was processed across the user, product and order services behind the service
        mesh. The W3C trace id below correlates every span generated while fulfilling it.
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold tracking-widest text-navy-400 uppercase">Trace ID</dt>
          <dd className="mt-1">
            <code className="block truncate rounded-lg bg-navy-900 px-3 py-2 font-mono text-xs break-all text-teal-300">
              {traceId}
            </code>
          </dd>
        </div>
      </dl>
      <a
        href={`${jaegerBase}/trace/${traceId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-700"
      >
        Open in Jaeger
        <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
          <path
            d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M12 4h4v4M9 11l7-7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <p className="mt-2 text-xs text-navy-400">{jaegerBase}</p>
    </section>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let order: Order;
  try {
    order = await getOrder(id);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    const message = error instanceof ApiError ? error.message : 'The order could not be loaded.';
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <ErrorBanner title="We could not load this order">
          <p>{message}</p>
        </ErrorBanner>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white transition-colors hover:bg-navy-800"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-up px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-teal-600 shadow-soft">
          <CheckIcon />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-navy-900">
          Thank you — your order is confirmed
        </h1>
        <p className="mt-3 text-navy-600">
          A receipt has been sent to{' '}
          <span className="font-medium text-navy-800">{order.customer.email}</span>. Arrives in
          3–5 working days.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy-50 px-4 py-1.5 text-sm text-navy-700">
          Order
          <span className="font-mono font-semibold text-navy-900">#{order.id}</span>
          <span aria-hidden="true">·</span>
          <span className="text-navy-500">{formatClockTime(order.createdAt)}</span>
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_20rem]">
        {/* Items */}
        <div className="space-y-8">
          <section aria-labelledby="items-heading" className="rounded-xl border border-navy-100 bg-white p-6 shadow-soft">
            <h2 id="items-heading" className="text-base font-semibold text-navy-900">
              Items
            </h2>
            <ul className="mt-4 divide-y divide-navy-100">
              {order.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="shrink-0 overflow-hidden rounded-lg border border-navy-100">
                    <ProductImage
                      src={`/img/${item.productId}`}
                      alt={item.name}
                      className="h-16 w-20"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-900">{item.name}</p>
                    <p className="mt-0.5 text-sm text-navy-500 tabular-nums">
                      {formatPrice(item.unitPrice, order.currency)} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-navy-900 tabular-nums">
                    {formatPrice(item.lineTotal, order.currency)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-2.5 border-t border-navy-100 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-navy-600">Subtotal</dt>
                <dd className="font-medium text-navy-900 tabular-nums">
                  {formatPrice(order.subtotal, order.currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-navy-600">Shipping</dt>
                <dd className="font-medium text-navy-900 tabular-nums">
                  {order.shippingCost === 0 ? 'Free' : formatPrice(order.shippingCost, order.currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-navy-600">Tax</dt>
                <dd className="font-medium text-navy-900 tabular-nums">
                  {formatPrice(order.tax, order.currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-navy-100 pt-3 text-base">
                <dt className="font-semibold text-navy-900">Total</dt>
                <dd className="font-semibold text-navy-900 tabular-nums">
                  {formatPrice(order.total, order.currency)}
                </dd>
              </div>
            </dl>
          </section>

          {order.traceId && <TracePanel traceId={order.traceId} />}
        </div>

        {/* Shipping address + next steps */}
        <aside className="space-y-6">
          <section aria-labelledby="address-heading" className="rounded-xl border border-navy-100 bg-white p-6 shadow-soft">
            <h2 id="address-heading" className="text-base font-semibold text-navy-900">
              Shipping to
            </h2>
            <address className="mt-3 text-sm leading-relaxed text-navy-700 not-italic">
              <span className="block font-medium text-navy-900">{order.customer.fullName}</span>
              <span className="block">{order.shippingAddress.line1}</span>
              {order.shippingAddress.line2 && (
                <span className="block">{order.shippingAddress.line2}</span>
              )}
              <span className="block">
                {order.shippingAddress.city}, {order.shippingAddress.postalCode}
              </span>
              <span className="block">{order.shippingAddress.country}</span>
            </address>
          </section>

          <section aria-labelledby="next-heading" className="rounded-xl border border-teal-200 bg-teal-50/70 p-6">
            <h2 id="next-heading" className="text-base font-semibold text-teal-900">
              What happens next
            </h2>
            <ol className="mt-3 space-y-2.5 text-sm text-teal-900/90">
              <li className="flex gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                  1
                </span>
                We pick and pack your items (1–2 days).
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                  2
                </span>
                Tracking details are emailed to you.
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                  3
                </span>
                Your order arrives within 3–5 working days.
              </li>
            </ol>
          </section>

          <Link
            href="/products"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-navy-200 px-4 text-sm font-medium text-navy-800 transition-colors hover:bg-navy-50"
          >
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
