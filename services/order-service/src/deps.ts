import { ServiceClient } from '@ecommerce/shared';

/** Upstream clients the checkout flow depends on. */
export interface OrderDeps {
  users: ServiceClient;
  products: ServiceClient;
}

/**
 * Build the real upstream clients from environment configuration:
 *   USER_SERVICE_URL    (default http://localhost:4001)
 *   PRODUCT_SERVICE_URL (default http://localhost:4002)
 *
 * Each client wraps a timeout, a circuit breaker and traceparent propagation.
 */
export function buildOrderDeps(): OrderDeps {
  return {
    users: new ServiceClient({
      service: 'user-service',
      baseUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:4001',
    }),
    products: new ServiceClient({
      service: 'product-service',
      baseUrl: process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:4002',
    }),
  };
}
