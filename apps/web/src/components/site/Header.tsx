import Link from 'next/link';
import SiteNavMenu from './SiteNavMenu';

const shopLinks = [
  { href: '/products?sort=featured', label: 'Featured' },
  { href: '/products?category=audio', label: 'Audio' },
  { href: '/products?category=wearables', label: 'Wearables' },
  { href: '/products?category=accessories', label: 'Accessories' },
];

/**
 * Sticky site header (server component). Interactivity — active-route
 * highlighting, mobile menu, cart count — lives in <SiteNavMenu />.
 */
export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-baseline gap-0.5 text-xl font-semibold tracking-tight text-navy-900"
          aria-label="Vantage Supply Co. — home"
        >
          Vantage
          <span aria-hidden="true" className="text-teal-500">
            .
          </span>
        </Link>
        <SiteNavMenu />
      </div>
    </header>
  );
}


