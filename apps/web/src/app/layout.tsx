import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { CartProvider } from '@/lib/cart';
import Footer from '@/components/site/Footer';
import Header from '@/components/site/Header';

export const metadata: Metadata = {
  title: {
    default: 'Vantage Supply Co. — Everyday tech, carefully chosen',
    template: '%s · Vantage',
  },
  description:
    'Everyday tech, carefully chosen. Shop audio, wearables and accessories — powered by an observable, service-mesh resilience lab.',
};

export const viewport: Viewport = {
  themeColor: '#0b1b36',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="flex min-h-screen flex-col bg-white text-navy-800 antialiased">
        <CartProvider>
          <a
            href="#main-content"
            className="sr-only rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
          >
            Skip to content
          </a>
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
