import Link from 'next/link';

const shopLinks = [
  { href: '/products', label: 'All products' },
  { href: '/products?sort=featured', label: 'Featured' },
  { href: '/products?category=audio', label: 'Audio' },
  { href: '/products?category=wearables', label: 'Wearables' },
];

const labLinks = [
  { href: '/admin', label: 'Resilience lab' },
];

/**
 * Site footer. Server component — the "Resilience Lab" column documents the
 * observability stack used by the admin dashboard.
 */
export default function Footer() {
  return (
    <footer className="bg-navy-950 text-navy-200">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand blurb */}
          <div className="lg:col-span-2">
            <p className="flex items-baseline gap-0.5 text-xl font-semibold text-white">
              Vantage
              <span aria-hidden="true" className="text-teal-400">
                .
              </span>
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-navy-300">
              Everyday tech, carefully chosen. A curated storefront for audio, wearables and
              accessories — built on an observable, service-mesh-native platform.
            </p>
          </div>

          {/* Shop links */}
          <nav aria-label="Footer shop">
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase">Shop</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {shopLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-navy-300 transition-colors hover:text-teal-300">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Resilience lab note */}
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
              Resilience Lab
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-navy-300">
              This storefront doubles as a service-mesh resilience engineering lab. Requests are
              traced end-to-end with OpenTelemetry and visualised in{' '}
              <span className="text-teal-300">Jaeger</span>; service metrics are scraped into{' '}
              <span className="text-teal-300">Prometheus</span> and charted in{' '}
              <span className="text-teal-300">Grafana</span>. Chaos experiments can be run safely
              against the local environment from the{' '}
              <Link href="/admin" className="font-medium text-teal-300 underline-offset-2 hover:underline">
                admin dashboard
              </Link>
              .
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {labLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-navy-300 transition-colors hover:text-teal-300">
                    {link.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-navy-800 pt-6 text-xs text-navy-400 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Vantage Supply Co. All rights reserved.</p>
          <p>
            Built for the MSc Service-Mesh Resilience Engineering project · GBP pricing · Ships
            across the UK
          </p>
        </div>
      </div>
    </footer>
  );
}
