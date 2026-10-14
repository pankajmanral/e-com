'use client';

/**
 * Client-side cart state, persisted to localStorage under 'vantage-cart-v1'.
 * Quantities are capped at the product's available stock.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface CartItem {
  productId: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  stock: number;
  quantity: number;
}

interface AddItemInput {
  productId: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  stock: number;
}

interface CartContextValue {
  items: CartItem[];
  /** True once localStorage has been read — avoids hydration mismatch. */
  mounted: boolean;
  count: number;
  subtotal: number;
  add: (item: AddItemInput, quantity?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

const STORAGE_KEY = 'vantage-cart-v1';

const CartContext = createContext<CartContextValue | null>(null);

function clampQuantity(quantity: number, stock: number): number {
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  const max = Math.max(stock, 0);
  return Math.min(Math.floor(quantity), Math.max(max, 1));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const loadedRef = useRef(false);

  // Load once on mount.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (entry): entry is CartItem =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as CartItem).productId === 'string' &&
              typeof (entry as CartItem).name === 'string' &&
              typeof (entry as CartItem).price === 'number' &&
              typeof (entry as CartItem).quantity === 'number',
          );
          setItems(valid);
        }
      }
    } catch {
      // Corrupt storage — start with an empty cart rather than crashing.
    }
    setMounted(true);
  }, []);

  // Persist on change (after the initial load).
  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full / private mode — cart still works in-memory.
    }
  }, [items, mounted]);

  const add = useCallback((item: AddItemInput, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((entry) => entry.productId === item.productId);
      if (existing) {
        return current.map((entry) =>
          entry.productId === item.productId
            ? {
                ...entry,
                // Refresh price/image/stock from the latest product data.
                ...item,
                quantity: clampQuantity(entry.quantity + quantity, item.stock),
              }
            : entry,
        );
      }
      return [...current, { ...item, quantity: clampQuantity(quantity, item.stock) }];
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((current) => current.filter((entry) => entry.productId !== productId));
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) =>
      current.flatMap((entry) => {
        if (entry.productId !== productId) return [entry];
        if (quantity < 1) return [];
        return [{ ...entry, quantity: clampQuantity(quantity, entry.stock) }];
      }),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { items, mounted, count, subtotal, add, remove, setQuantity, clear };
  }, [items, mounted, add, remove, setQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

/** Small cart indicator used in the header nav. */
export function CartBadge() {
  const { count, mounted } = useCart();
  return (
    <span
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-teal-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular-nums"
      aria-hidden={mounted && count === 0 ? 'true' : undefined}
    >
      {mounted ? count : 0}
    </span>
  );
}
