import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Order } from '@ecommerce/shared';
import { SEED_ORDERS } from './data/orders';

export interface OrderStoreOptions {
  /** Absolute path of the JSON file; defaults to `<service>/data/orders.json` (env `ORDERS_FILE`). */
  filePath?: string;
  /** Keep orders in memory only — used by tests so no file is written. */
  memoryOnly?: boolean;
  /** Orders used when no persisted file exists yet (defaults to SEED_ORDERS). */
  seed?: Order[];
}

export interface OrderListFilter {
  userId?: string;
  email?: string;
  limit?: number;
}

export interface OrderListResult {
  items: Order[];
  total: number;
}

export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  currency: string;
}

interface StoredOrder {
  order: Order;
  /** Insertion sequence — tie breaker when timestamps are equal. */
  seq: number;
}

/** Default persistence location: `<service root>/data/orders.json`. */
export function defaultOrdersFile(): string {
  return process.env.ORDERS_FILE?.trim() || join(__dirname, '..', 'data', 'orders.json');
}

/**
 * JSON-file backed order store.
 *
 * - loads on boot (falls back to the seed file if the JSON is corrupt)
 * - writes atomically (temp file + rename) so a crash never truncates the file
 * - `memoryOnly` mode for unit tests
 */
export class OrderStore {
  private readonly orders = new Map<string, StoredOrder>();
  private readonly filePath?: string;
  private readonly memoryOnly: boolean;
  private seq = 0;

  constructor(options: OrderStoreOptions = {}) {
    this.memoryOnly = options.memoryOnly ?? false;
    this.filePath = this.memoryOnly ? undefined : (options.filePath ?? defaultOrdersFile());

    const persisted = this.load();
    const initial = persisted ?? options.seed ?? SEED_ORDERS;
    for (const order of initial) {
      this.orders.set(order.id, { order, seq: (this.seq += 1) });
    }
  }

  private load(): Order[] | undefined {
    if (!this.filePath || !existsSync(this.filePath)) return undefined;
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed) ? (parsed as Order[]) : undefined;
    } catch {
      // corrupt file — start from the seed instead of crashing on boot
      return undefined;
    }
  }

  private persist(): void {
    if (this.memoryOnly || !this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const payload = this.sorted().map((entry) => entry.order);
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }

  private sorted(): StoredOrder[] {
    return Array.from(this.orders.values()).sort((a, b) => a.seq - b.seq);
  }

  add(order: Order): Order {
    this.orders.set(order.id, { order, seq: (this.seq += 1) });
    this.persist();
    return order;
  }

  get(id: string): Order | undefined {
    return this.orders.get(id)?.order;
  }

  count(): number {
    return this.orders.size;
  }

  /** Newest first, optionally filtered by userId or email. */
  list(filter: OrderListFilter = {}): OrderListResult {
    const limit = filter.limit ?? 50;
    const email = filter.email?.toLowerCase();

    const matches = this.sorted()
      .map((entry) => entry.order)
      .filter((order) => {
        if (filter.userId && order.userId !== filter.userId) return false;
        if (email && order.customer.email.toLowerCase() !== email) return false;
        return true;
      });

    const newestFirst = [...matches].sort((a, b) => {
      const byDate = b.createdAt.localeCompare(a.createdAt);
      if (byDate !== 0) return byDate;
      return (this.orders.get(b.id)?.seq ?? 0) - (this.orders.get(a.id)?.seq ?? 0);
    });

    return { items: newestFirst.slice(0, limit), total: matches.length };
  }

  stats(): OrderStats {
    const orders = this.sorted().map((entry) => entry.order);
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
    const roundedRevenue = Math.round(totalRevenue * 100) / 100;
    return {
      totalOrders: orders.length,
      totalRevenue: roundedRevenue,
      averageOrderValue: orders.length > 0 ? Math.round((roundedRevenue / orders.length) * 100) / 100 : 0,
      currency: 'INR',
    };
  }
}
