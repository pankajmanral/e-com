import { createServiceApp } from '@ecommerce/shared';
import { createProductsRouter } from './routes/products';
import { productStore } from './store';

/**
 * Builds the product-service express app.
 *
 * Tests inject a fresh store so every suite starts from pristine seed stock.
 */
export function createApp(store = productStore) {
  return createServiceApp({
    name: 'product-service',
    version: '1.0.0',
    basePath: '/api',
    router: createProductsRouter(store),
  });
}