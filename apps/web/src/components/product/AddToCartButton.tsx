'use client';

/**
 * Quantity stepper + add-to-cart for the product detail page.
 * Shows an inline confirmation after a successful add.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/format';

export interface AddToCartButtonProps {
  product: {
    id: string;
    slug: string;
    name: string;
    price: number;
    currency: string;
    image: string;
    stock: number;
  };
}

export default function AddToCartButton({ product }: AddToCartButtonProps) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const outOfStock = product.stock <= 0;
  const max = Math.max(product.stock, 0);

  const clamped = (value: number) => Math.max(1, Math.min(value, Math.max(max, 1)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Quantity stepper */}
        <div
          className="inline-flex h-12 items-center rounded-lg border border-navy-200 bg-white"
          role="group"
          aria-label="Quantity"
        >
          <button
            type="button"
            onClick={() => setQuantity((value) => clamped(value - 1))}
            disabled={outOfStock || quantity <= 1}
            aria-label="Decrease quantity"
            title="Decrease quantity"
            className="flex size-12 items-center justify-center rounded-l-lg text-navy-700 transition-colors hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span
            className="w-12 text-center text-sm font-semibold text-navy-900 tabular-nums"
            aria-live="polite"
          >
            {outOfStock ? 0 : quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((value) => clamped(value + 1))}
            disabled={outOfStock || quantity >= max}
            aria-label="Increase quantity"
            title="Increase quantity"
            className="flex size-12 items-center justify-center rounded-r-lg text-navy-700 transition-colors hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <Button
          type="button"
          size="lg"
          disabled={outOfStock}
          onClick={() => {
            add(
          {
            productId: product.id,
            name: product.name,
            slug: product.slug,
            price: product.price,
            image: product.image,
            stock: product.stock,
          },
          quantity,
        );
            setJustAdded(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setJustAdded(false), 2600);
          }}
        >
          {outOfStock ? 'Out of stock' : `Add to cart · ${formatPrice(product.price * quantity, product.currency)}`}
        </Button>
      </div>

      {/* Inline confirmation */}
      <div aria-live="polite">
        {justAdded && (
          <p className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 animate-fade-in">
            <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
              <path d="m4 10.5 4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {quantity} × {product.name} added to your cart.{' '}
            <Link href="/cart" className="font-semibold underline underline-offset-2 hover:text-teal-800">
              View cart
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
