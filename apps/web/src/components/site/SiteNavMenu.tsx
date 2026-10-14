'use client';

/**
 * Primary navigation: active-route styling, cart badge and the mobile
 * hamburger menu. Client-only because it reads the pathname and cart state.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { CartBadge } from '@/lib/cart';

const links = [
  { href: '/', label: 'Home' },
  { href: '/products', label: 'Shop' },
  { href: '/cart', label: 'Cart', showBadge: true },
  { href: '/admin', label: 'Admin' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/cart') return pathname.startsWith('/cart') || pathname.startsWith('/checkout') || pathname.startsWith('/orders');
  return pathname.startsWith(href);
}

export default function SiteNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <nav aria-label="Primary" className="flex items-center">
      {/* Desktop nav */}
      <ul className="hidden items-center gap-1 sm:flex">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isActive(pathname, link.href) ? 'page' : undefined}
              className={clsx(
                'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive(pathname, link.href)
                  ? 'bg-navy-50 text-navy-900'
                  : 'text-navy-600 hover:bg-navy-50 hover:text-navy-900',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {link.label}
                {link.showBadge && <CartBadge />}
              </span>
              {isActive(pathname, link.href) && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-teal-500"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? 'Close menu' : 'Open menu'}
        title={open ? 'Close menu' : 'Open menu'}
        className="inline-flex size-10 items-center justify-center rounded-lg text-navy-800 transition-colors hover:bg-navy-50 sm:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {/* Mobile menu panel */}
      {open && (
        <div
          id="mobile-nav"
          className="absolute inset-x-0 top-16 border-b border-navy-100 bg-white shadow-soft sm:hidden"
        >
          <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(pathname, link.href) ? 'page' : undefined}
                  className={clsx(
                    'flex items-center justify-between rounded-lg px-3 py-2.5 text-base font-medium transition-colors',
                    isActive(pathname, link.href)
                      ? 'bg-navy-50 text-navy-900'
                      : 'text-navy-700 hover:bg-navy-50',
                  )}
                >
                  {link.label}
                  {link.showBadge && <CartBadge />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
