'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SiteNavMenu from './SiteNavMenu';

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Sticky site header. Auth state is fetched from /api/auth/me (server-side
 * session cookie is forwarded automatically by the browser).
 */
export default function Header() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) {
          setUser(null);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUser(data.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-baseline gap-0.5 text-xl font-semibold tracking-tight text-navy-900"
            aria-label="Vantage Supply Co. — home"
          >
            Vantage
            <span aria-hidden="true" className="text-teal-500">.</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-navy-500">Loading…</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-baseline gap-0.5 text-xl font-semibold tracking-tight text-navy-900"
          aria-label="Vantage Supply Co. — home"
        >
          Vantage
          <span aria-hidden="true" className="text-teal-500">.</span>
        </Link>
        <SiteNavMenu user={user} />
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-navy-600">
                {user.role === 'admin' ? 'Admin · ' : ''}{user.email}
              </span>
              <button
                onClick={() => {
                  void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
                    window.location.href = '/';
                  });
                }}
                className="text-sm font-medium text-navy-800 hover:text-teal-600 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-navy-600 hover:text-teal-600 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
