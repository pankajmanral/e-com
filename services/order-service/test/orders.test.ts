import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError, ServiceClient } from '@ecommerce/shared';
import type { Product, User } from '@ecommerce/shared';
import { initTracing } from '@ecommerce/shared/tracing';
import { createApp } from '../src/app';
import { OrderStore } from '../src/store';

// Registers a real (console-exported) tracer provider so `withSpan` produces
// valid trace ids the tests can assert on. No collector is needed.
process.env.OTEL_TRACES_EXPORTER = 'console';
initTracing('order-service');

const productA: Product = {
  id: 'prd-2001',
  slug: 'aurora-wireless-headphones',
  name: 'Aurora Wireless Headphones',
  description: 'Test double for the happy path.',
  category: 'audio',
  price: 5498.9,
  currency: 'INR',
  stock: 10,
  rating: 4.7,
  reviewCount: 120,
  featured: true,
  tags: ['wireless'],
  image: '/img/aurora-wireless-headphones',
};

const productB: Product = {
  id: 'prd-2002',
  slug: 'nomad-bluetooth-speaker',
  name: 'Nomad Bluetooth Speaker',
  description: 'Second test double for the happy path.',
  category: 'audio',
  price: 3298.9,
  currency: 'INR',
  stock: 5,
  rating: 4.5,
  reviewCount: 300,
  featured: false,
  tags: ['portable'],
  image: '/img/nomad-bluetooth-speaker',
};

const fakeUser: User = {
  id: 'usr-1001',
  fullName: 'Amelia Hartley',
  email: 'amelia.hartley@example.com',
  phone: '+91 98765 43210',
  address: {
    line1: '18 Marine Parade',
    city: 'Mumbai',
    postalCode: '400001',
    country: 'India',
  },
  createdAt: '2024-03-11T09:15:00.000Z',
};

interface StockCall {
  orderId: string;
  items: { productId: string; quantity: number }[];
}

function fakeUsersClient() {
  const calls: { path: string; body: unknown }[] = [];
  const client = {
    service: 'user-service',
    baseUrl: 'http://127.0.0.1:59901',
    getBreakerSnapshot: () => ({ service: 'user-service', baseUrl: 'http://127.0.0.1:59901', state: 'closed', failures: 0 }),
    get: async () => {
      throw new Error('unexpected GET on fake user-service');
    },
    post: async (path: string, body: unknown) => {
      calls.push({ path, body });
      if (path !== '/api/users/resolve') throw new Error(`unexpected POST ${path}`);
      return { user: fakeUser, created: false };
    },
  } as unknown as ServiceClient;
  return { client, calls };
}

function fakeProductsClient(products: Product[], options: { deductError?: () => Error } = {}) {
  const gets: string[] = [];
  const deducts: StockCall[] = [];
  const restores: StockCall[] = [];
  const client = {
    service: 'product-service',
    baseUrl: 'http://127.0.0.1:59902',
    getBreakerSnapshot: () => ({
      service: 'product-service',
      baseUrl: 'http://127.0.0.1:59902',
      state: 'closed',
      failures: 0,
    }),
    get: async (path: string) => {
      gets.push(path);
      const id = decodeURIComponent(path.split('/').pop() ?? '');
      const product = products.find((candidate) => candidate.id === id);
      if (!product) throw new AppError(404, 'UPSTREAM_CLIENT_ERROR', `Product '${id}' not found`);
      return product;
    },
    post: async (path: string, body: unknown) => {
      if (path.endsWith('/stock/deduct')) {
        deducts.push(body as StockCall);
        if (options.deductError) throw options.deductError();
        return { ok: true, ...(body as object), deductedAt: new Date().toISOString(), items: [] };
      }
      if (path.endsWith('/stock/restore')) {
        restores.push(body as StockCall);
        return { ok: true, ...(body as object), items: [] };
      }
      throw new Error(`unexpected POST ${path}`);
    },
  } as unknown as ServiceClient;
  return { client, gets, deducts, restores };
}

function buildApp(config: { products?: Product[]; deductError?: () => Error } = {}) {
  const store = new OrderStore({ memoryOnly: true, seed: [] });
  const users = fakeUsersClient();
  const products = fakeProductsClient(config.products ?? [productA, productB], { deductError: config.deductError });
  const { app } = createApp({ store, deps: { users: users.client, products: products.client } });
  return { app, store, users, products };
}

const basePayload = {
  customer: {
    fullName: 'Amelia Hartley',
    email: 'amelia.hartley@example.com',
    phone: '+91 98765 43210',
  },
  shippingAddress: {
    line1: '18 Marine Parade',
    city: 'Mumbai',
    postalCode: '400001',
    country: 'India',
  },
  items: [
    { productId: 'prd-2001', quantity: 1 },
    { productId: 'prd-2002', quantity: 1 },
  ],
  payment: {
    method: 'card',
    cardholderName: 'Amelia Hartley',
    cardNumber: '4242 4242 4242 4242',
    expiryMMYY: '12/28',
    cvc: '123',
  },
};

describe('order-service checkout', () => {
  it('creates an order end-to-end (201, totals, traceId, persistence)', async () => {
    const { app, store, users, products } = buildApp();

    const res = await request(app).post('/api/orders').send(basePayload);
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^ord-/);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.currency).toBe('INR');
    expect(res.body.userId).toBe('usr-1001');
    expect(res.body.customer).toEqual({
      fullName: 'Amelia Hartley',
      email: 'amelia.hartley@example.com',
    });

    // pricing: ₹5,498.90 + ₹3,298.90 + ₹764.50 shipping + ₹703.82 tax.
    expect(res.body.subtotal).toBe(8797.8);
    expect(res.body.shippingCost).toBe(764.5);
    expect(res.body.tax).toBe(703.82);
    expect(res.body.total).toBe(10266.12);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toEqual({
      productId: 'prd-2001',
      name: 'Aurora Wireless Headphones',
      unitPrice: 5498.9,
      quantity: 1,
      lineTotal: 5498.9,
    });

    // trace propagation: header and body carry the same valid trace id
    expect(res.body.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(res.headers['x-trace-id']).toBe(res.body.traceId);

    // side effects on the fakes
    expect(users.calls).toHaveLength(1);
    expect(users.calls[0].path).toBe('/api/users/resolve');
    expect(products.deducts).toHaveLength(1);
    expect(products.deducts[0].orderId).toBe(res.body.id);
    expect(products.restores).toHaveLength(0);

    // persisted + readable back through the API
    const fetched = await request(app).get(`/api/orders/${res.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(res.body);

    const listed = await request(app).get('/api/orders').query({ email: 'amelia.hartley@example.com' });
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.items[0].id).toBe(res.body.id);

    const stats = await request(app).get('/api/orders/stats');
    expect(stats.body.totalOrders).toBe(1);
    expect(stats.body.totalRevenue).toBe(10266.12);
    expect(stats.body.averageOrderValue).toBe(10266.12);
    expect(stats.body.currency).toBe('INR');

    expect(store.count()).toBe(1);
  });

  it('declines a failing card with 402 before touching stock', async () => {
    const { app, products } = buildApp();

    const res = await request(app)
      .post('/api/orders')
      .send({
        ...basePayload,
        payment: { ...basePayload.payment, cardNumber: '4000000000000002' },
      });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_DECLINED');
    expect(res.body.error.message).toContain('4242 4242 4242 4242');

    // payment happens before stock — nothing must have been deducted
    expect(products.deducts).toHaveLength(0);
    expect(products.restores).toHaveLength(0);

    const stats = await request(app).get('/api/orders/stats');
    expect(stats.body.totalOrders).toBe(0);
  });

  it('compensates a failed stock reservation with restore and returns 503', async () => {
    const { app, products, store } = buildApp({
      deductError: () => new AppError(409, 'CONFLICT', 'Insufficient stock', { productId: 'prd-2001' }),
    });

    const res = await request(app).post('/api/orders').send(basePayload);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toContain('product-service');

    // the saga compensates: restore is attempted after the failed deduct
    expect(products.deducts).toHaveLength(1);
    expect(products.restores).toHaveLength(1);
    expect(products.restores[0].orderId).toBe(products.deducts[0].orderId);
    expect(products.restores[0].items).toEqual(products.deducts[0].items);

    // failed checkout must not persist an order
    expect(store.count()).toBe(0);
    const list = await request(app).get('/api/orders');
    expect(list.body.total).toBe(0);
  });

  it('rejects an empty items array with VALIDATION_ERROR details', async () => {
    const { app, products } = buildApp();

    const res = await request(app).post('/api/orders').send({ ...basePayload, items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(products.deducts).toHaveLength(0);
  });

  it('aborts with 404 for an unknown product before payment or stock', async () => {
    const { app, products } = buildApp({ products: [productB] }); // prd-2001 unknown

    const res = await request(app).post('/api/orders').send(basePayload);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('prd-2001');
    expect(products.deducts).toHaveLength(0);
    expect(products.restores).toHaveLength(0);
  });

  it('lists orders newest-first with filters and returns dependency health', async () => {
    const { app } = buildApp();

    const first = await request(app).post('/api/orders').send(basePayload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/orders')
      .send({
        ...basePayload,
        customer: { ...basePayload.customer, email: 'second.buyer@example.com' },
      });
    expect(second.status).toBe(201);

    const list = await request(app).get('/api/orders');
    expect(list.body.total).toBe(2);
    expect(list.body.items[0].id).toBe(second.body.id); // newest first
    expect(list.body.items[1].id).toBe(first.body.id);

    const filtered = await request(app).get('/api/orders').query({ userId: 'usr-1001', limit: 1 });
    expect(filtered.body.total).toBe(2);
    expect(filtered.body.items).toHaveLength(1);

    const unknown = await request(app).get('/api/orders/ord-does-not-exist');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');

    const deps = await request(app).get('/api/orders/deps');
    expect(deps.status).toBe(200);
    expect(deps.body.dependencies).toHaveLength(2);
    const services = deps.body.dependencies.map((entry: { service: string }) => entry.service);
    expect(services).toEqual(['user-service', 'product-service']);
    for (const entry of deps.body.dependencies) {
      expect(entry.baseUrl).toMatch(/^http/);
      expect(entry.circuitBreaker).toHaveProperty('state');
      expect(entry.health).toHaveProperty('status');
      expect(entry.health).toHaveProperty('latencyMs');
    }
  });

  it('persists orders to a JSON file when a file-backed store is used', async () => {
    const file = join(tmpdir(), `order-service-test-${Date.now()}.json`);
    const store = new OrderStore({ filePath: file, seed: [] });
    const users = fakeUsersClient();
    const products = fakeProductsClient([productA, productB]);
    const { app } = createApp({ store, deps: { users: users.client, products: products.client } });

    const res = await request(app).post('/api/orders').send(basePayload);
    expect(res.status).toBe(201);

    // a brand-new store instance reads the same file back from disk
    const reloaded = new OrderStore({ filePath: file });
    expect(reloaded.count()).toBe(1);
    expect(reloaded.get(res.body.id)?.total).toBe(10266.12);
  });
});
