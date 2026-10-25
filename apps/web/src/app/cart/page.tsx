import type { Metadata } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CartView from '@/components/cart/CartView';

export const metadata: Metadata = { title: 'Your cart' };
export const dynamic = 'force-dynamic';

export default function CartPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
      .then((res) => {
        setAuthenticated(res.ok);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="mx-auto max-w-7xl animate-fade-up px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-navy-500">Loading cart…</p>
      </div>
    );
  }

  if (!authenticated) {
    router.push('/login');
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-up px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-2 text-sm text-navy-500">
        <Link href="/" className="transition-colors hover:text-teal-600">
          Home
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-navy-700">Cart</span>
      </div>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight text-navy-900">Your cart</h1>
      <CartView />
    </div>
  );
}
