'use client';

/**
 * Quick "add to cart" control used on product cards.
 * Confirms inline with a short-lived "Added ✓" state.
 */

import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/Button';

export interface QuickAddProps {
  product: {
    id: string;
    slug: string;
    name: string;
    price: number;
    image: string;
    stock: number;
  };
}

export default function QuickAddButton({ product }: QuickAddProps) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
      .then((res) => setAuthenticated(res.ok))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (checking) {
    return null;
  }

  if (!authenticated) {
    return null;
  }

  const disabled = product.stock <= 0;

  return (
    <Button
      type="button"
      size="sm"
      variant={added ? 'navy' : 'teal'}
      disabled={disabled}
      aria-label={disabled ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
      onClick={(event) => {
        // Card is wrapped in a link — don't navigate on quick add.
        event.preventDefault();
        event.stopPropagation();
        add({
          productId: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          image: product.image,
          stock: product.stock,
        });
        setAdded(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setAdded(false), 1600);
      }}
    >
      {added ? (
        <>
          <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
            <path d="m4 10.5 4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Added
        </>
      ) : disabled ? (
        'Out of stock'
      ) : (
        'Quick add'
      )}
    </Button>
  );
}
