import type { Metadata } from 'next';
import Link from 'next/link';
import CheckoutForm from '@/components/checkout/CheckoutForm';

export const metadata: Metadata = { title: 'Checkout' };
export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-7xl animate-fade-up px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-2 text-sm text-navy-500">
        <Link href="/" className="transition-colors hover:text-teal-600">
          Home
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link href="/cart" className="transition-colors hover:text-teal-600">
          Cart
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-navy-700">Checkout</span>
      </div>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight text-navy-900">Checkout</h1>
      <p className="mb-8 text-navy-600">
        Your order is placed through the order service and traced end-to-end.
      </p>
      <CheckoutForm />
    </div>
  );
}
