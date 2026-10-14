import type { Product, ProductCategory, ProductListResponse } from '@ecommerce/shared';
import { AppError } from '@ecommerce/shared';
import { CATEGORIES, SEED_PRODUCTS } from './data/products';

export type ProductSort = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';

export interface ProductListQuery {
  /** Case-insensitive match against name, description and tags. */
  search?: string;
  category?: ProductCategory;
  sort?: ProductSort;
  page?: number;
  perPage?: number;
  /** Only products flagged as featured. */
  featured?: boolean;
}

/**
 * In-memory catalogue. Cloned on construction so tests can build several
 * isolated stores without leaking stock mutations between them.
 */
export class ProductStore {
  readonly mode = 'memory' as const;
  private readonly products = new Map<string, Product>();

  constructor(seed: Product[] = SEED_PRODUCTS) {
    for (const product of seed) {
      this.products.set(product.id, { ...product, tags: [...product.tags] });
    }
  }

  all(): Product[] {
    return Array.from(this.products.values());
  }

  /** Lookup by product id (`prd-2001`) or by kebab-case slug. */
  getByIdOrSlug(key: string): Product | undefined {
    return this.products.get(key) ?? this.all().find((product) => product.slug === key);
  }

  list(query: ProductListQuery = {}): ProductListResponse {
    const sort: ProductSort = query.sort ?? 'featured';
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 12;

    let items = this.all();

    if (query.category) {
      const category = query.category;
      items = items.filter((product) => product.category === category);
    }
    if (query.featured) {
      items = items.filter((product) => product.featured);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      items = items.filter(
        (product) =>
          product.name.toLowerCase().includes(needle) ||
          product.description.toLowerCase().includes(needle) ||
          product.tags.some((tag) => tag.toLowerCase().includes(needle)),
      );
    }

    items = (() => {
      switch (sort) {
        case 'price-asc':
          return items.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
        case 'price-desc':
          return items.sort((a, b) => b.price - a.price || a.id.localeCompare(b.id));
        case 'rating':
          return items.sort((a, b) => b.rating - a.rating || b.reviewCount - b.reviewCount);
        case 'newest':
          // ids are issued sequentially, so the highest id is the newest product
          return items.sort((a, b) => b.id.localeCompare(a.id));
        case 'featured':
        default:
          return items.sort(
            (a, b) => Number(b.featured) - Number(a.featured) || b.rating - a.rating || a.id.localeCompare(b.id),
          );
      }
    })();

    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;
    return { items: items.slice(start, start + perPage), total, page, pages, perPage };
  }

  categories(): { slug: string; name: string; count: number; priceRange: { min: number; max: number } }[] {
    const all = this.all();
    return CATEGORIES.map((category) => {
      const inCategory = all.filter((product) => product.category === category.slug);
      const prices = inCategory.map((product) => product.price);
      return {
        slug: category.slug,
        name: category.name,
        count: inCategory.length,
        priceRange: {
          min: prices.length > 0 ? Math.min(...prices) : 0,
          max: prices.length > 0 ? Math.max(...prices) : 0,
        },
      };
    });
  }

  stats(): { total: number; byCategory: Record<string, number>; totalStockValue: number; lowStockCount: number } {
    const byCategory: Record<string, number> = {};
    for (const category of CATEGORIES) byCategory[category.slug] = 0;

    let totalStockValue = 0;
    let lowStockCount = 0;
    for (const product of this.all()) {
      byCategory[product.category] = (byCategory[product.category] ?? 0) + 1;
      totalStockValue += product.price * product.stock;
      if (product.stock <= 5) lowStockCount += 1;
    }

    return {
      total: this.products.size,
      byCategory,
      totalStockValue: Math.round(totalStockValue * 100) / 100,
      lowStockCount,
    };
  }

  /**
   * ATOMIC all-or-nothing stock reservation: every requested line must exist
   * with sufficient stock or nothing is deducted. Duplicate lines for the same
   * product are merged first so two rows cannot oversell together.
   */
  deduct(orderId: string, items: { productId: string; quantity: number }[]): { ok: true; orderId: string; deductedAt: string; items: { productId: string; name: string; stock: number }[] } {
    const requested = new Map<string, number>();
    for (const item of items) {
      requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
    }

    const targets: { product: Product; quantity: number }[] = [];
    for (const [productId, quantity] of requested) {
      const product = this.products.get(productId);
      const available = product?.stock ?? 0;
      if (!product || available < quantity) {
        throw AppError.conflict(`Insufficient stock for product '${productId}'`, {
          productId,
          available,
          requested: quantity,
        });
      }
      targets.push({ product, quantity });
    }

    for (const target of targets) {
      target.product.stock -= target.quantity;
    }

    return {
      ok: true,
      orderId,
      deductedAt: new Date().toISOString(),
      items: targets.map(({ product }) => ({ productId: product.id, name: product.name, stock: product.stock })),
    };
  }

  /**
   * Compensating restore used by the order saga when checkout rolls back.
   * Deliberately forgiving: unknown product ids are skipped so replaying the
   * compensation can never fail or double-count missing products.
   */
  restore(orderId: string, items: { productId: string; quantity: number }[]): { ok: true; orderId: string; items: { productId: string; stock: number }[] } {
    const restored: { productId: string; stock: number }[] = [];
    for (const item of items) {
      const product = this.products.get(item.productId);
      if (!product) continue; // idempotent compensation: skip unknown ids
      product.stock += item.quantity;
      restored.push({ productId: product.id, stock: product.stock });
    }
    return { ok: true, orderId, items: restored };
  }
}

/** Default singleton used by the running service (tests can inject a fresh store). */
export const productStore = new ProductStore();