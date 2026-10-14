import { createServiceApp } from '@ecommerce/shared';
import { buildOrderDeps, type OrderDeps } from './deps';
import { createOrdersRouter } from './routes/orders';
import { OrderStore } from './store';

export interface CreateAppOptions {
  /** Inject a test store (e.g. `new OrderStore({ memoryOnly: true, seed: [] })`). */
  store?: OrderStore;
  /** Override one or both upstream clients with deterministic fakes. */
  deps?: Partial<OrderDeps>;
}

let sharedStore: OrderStore | undefined;

/**
 * Builds the order-service express app. The optional store/deps keep the HTTP
 * flow testable without touching the network or the filesystem.
 */
export function createApp(options: CreateAppOptions = {}) {
  const store = options.store ?? (sharedStore ??= new OrderStore());
  const deps: OrderDeps = { ...buildOrderDeps(), ...options.deps };

  return createServiceApp({
    name: 'order-service',
    version: '1.0.0',
    basePath: '/api',
    router: createOrdersRouter({ store, deps }),
  });
}
