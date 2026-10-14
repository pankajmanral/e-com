import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { ProductStore } from '../src/store';

let app: ReturnType<typeof createApp>['app'];

// A fresh store per test keeps stock mutations isolated from the seed data.
beforeEach(() => {
  ({ app } = createApp(new ProductStore()));
});

describe('product-service API', () => {
  it('reports health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('product-service');
  });

  it('lists products with defaults and correct pagination math', async () => {
    const first = await request(app).get('/api/products');
    expect(first.status).toBe(200);
    expect(first.body.total).toBe(24);
    expect(first.body.page).toBe(1);
    expect(first.body.perPage).toBe(12);
    expect(first.body.pages).toBe(2);
    expect(first.body.items).toHaveLength(12);

    const second = await request(app).get('/api/products?page=2');
    expect(second.status).toBe(200);
    expect(second.body.page).toBe(2);
    expect(second.body.items).toHaveLength(12);
    const firstIds: string[] = first.body.items.map((item: { id: string }) => item.id);
    const secondIds: string[] = second.body.items.map((item: { id: string }) => item.id);
    expect(secondIds.filter((id) => firstIds.includes(id))).toHaveLength(0);

    const small = await request(app).get('/api/products?perPage=10');
    expect(small.body.perPage).toBe(10);
    expect(small.body.pages).toBe(3);
    expect(small.body.items).toHaveLength(10);

    const beyond = await request(app).get('/api/products?page=9');
    expect(beyond.body.items).toHaveLength(0);
    expect(beyond.body.total).toBe(24);
  });

  it('searches name, description and tags case-insensitively', async () => {
    const res = await request(app).get('/api/products?search=aurora');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe('prd-2001');

    const upper = await request(app).get('/api/products?search=AURORA');
    expect(upper.body.total).toBe(1);
    expect(upper.body.items[0].id).toBe('prd-2001');
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/products?category=wearables&perPage=48');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.items.every((item: { category: string }) => item.category === 'wearables')).toBe(true);
  });

  it('filters featured products', async () => {
    const res = await request(app).get('/api/products?featured=true&perPage=48');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.items.every((item: { featured: boolean }) => item.featured)).toBe(true);
  });

  it('sorts by price ascending and descending', async () => {
    const asc = await request(app).get('/api/products?sort=price-asc&perPage=48');
    expect(asc.status).toBe(200);
    const ascPrices: number[] = asc.body.items.map((item: { price: number }) => item.price);
    expect(ascPrices[0]).toBe(19.99);
    expect([...ascPrices].sort((a, b) => a - b)).toEqual(ascPrices);

    const desc = await request(app).get('/api/products?sort=price-desc&perPage=48');
    expect(desc.status).toBe(200);
    const descPrices: number[] = desc.body.items.map((item: { price: number }) => item.price);
    expect(descPrices[0]).toBe(899);
    expect([...descPrices].sort((a, b) => b - a)).toEqual(descPrices);
  });

  it('returns a product by id and by slug, otherwise 404', async () => {
    const byId = await request(app).get('/api/products/prd-2001');
    expect(byId.status).toBe(200);
    expect(byId.body.slug).toBe('aurora-wireless-headphones');

    const bySlug = await request(app).get('/api/products/aurora-wireless-headphones');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.id).toBe('prd-2001');

    const missing = await request(app).get('/api/products/prd-9999');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(missing.body.error.message).toBe('Product not found');
  });

  it('lists categories with counts and price ranges', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    const audio = res.body.find((category: { slug: string }) => category.slug === 'audio');
    expect(audio.name).toBe('Audio');
    expect(audio.count).toBe(5);
    expect(audio.priceRange.min).toBe(69.99);
    expect(audio.priceRange.max).toBe(349);
    const totalCount: number = res.body.reduce(
      (sum: number, category: { count: number }) => sum + category.count,
      0,
    );
    expect(totalCount).toBe(24);
  });

  it('deducts stock atomically on success', async () => {
    const res = await request(app)
      .post('/api/products/stock/deduct')
      .send({
        orderId: 'ord-test-1',
        items: [
          { productId: 'prd-2012', quantity: 5 },
          { productId: 'prd-2024', quantity: 2 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.orderId).toBe('ord-test-1');
    expect(res.body.deductedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.items).toEqual([
      { productId: 'prd-2012', name: 'Titan USB-C Braided Cable', stock: 195 },
      { productId: 'prd-2024', name: 'Cove Magnetic Wallet', stock: 185 },
    ]);

    const check = await request(app).get('/api/products/prd-2012');
    expect(check.body.stock).toBe(195);
  });

  it('rejects an insufficient deduction without any partial decrement', async () => {
    const res = await request(app)
      .post('/api/products/stock/deduct')
      .send({
        orderId: 'ord-test-2',
        items: [
          { productId: 'prd-2021', quantity: 5 }, // plenty of stock (149)
          { productId: 'prd-2008', quantity: 10 }, // shortage (3 available)
        ],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details).toEqual({ productId: 'prd-2008', available: 3, requested: 10 });

    // the healthy line item must be untouched — all-or-nothing
    const healthy = await request(app).get('/api/products/prd-2021');
    expect(healthy.body.stock).toBe(149);
    const short = await request(app).get('/api/products/prd-2008');
    expect(short.body.stock).toBe(3);
  });

  it('restores stock and stays safe to replay (idempotent compensation)', async () => {
    const deducted = await request(app)
      .post('/api/products/stock/deduct')
      .send({ orderId: 'ord-test-3', items: [{ productId: 'prd-2014', quantity: 4 }] });
    expect(deducted.status).toBe(200);
    expect(deducted.body.items[0].stock).toBe(0);

    const restore = await request(app)
      .post('/api/products/stock/restore')
      .send({ orderId: 'ord-test-3', items: [{ productId: 'prd-2014', quantity: 4 }] });
    expect(restore.status).toBe(200);
    expect(restore.body.ok).toBe(true);
    expect(restore.body.items).toEqual([{ productId: 'prd-2014', stock: 4 }]);

    // replaying compensation for an unknown product must never fail
    const replay = await request(app)
      .post('/api/products/stock/restore')
      .send({ orderId: 'ord-test-3', items: [{ productId: 'prd-ghost', quantity: 4 }] });
    expect(replay.status).toBe(200);
    expect(replay.body.ok).toBe(true);
    expect(replay.body.items).toEqual([]);

    const check = await request(app).get('/api/products/prd-2014');
    expect(check.body.stock).toBe(4);
  });

  it('reports catalogue stats for dashboards', async () => {
    const res = await request(app).get('/api/products/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(24);
    expect(res.body.byCategory.audio).toBe(5);
    expect(res.body.byCategory.wearables).toBe(5);
    expect(res.body.byCategory.accessories).toBe(5);
    expect(res.body.byCategory['home-tech']).toBe(5);
    expect(res.body.byCategory.mobile).toBe(4);
    expect(res.body.lowStockCount).toBe(3);
    expect(res.body.totalStockValue).toBeGreaterThan(10_000);
  });

  it('rejects invalid query params and payloads with validation details', async () => {
    const badPage = await request(app).get('/api/products?page=0');
    expect(badPage.status).toBe(400);
    expect(badPage.body.error.code).toBe('VALIDATION_ERROR');

    const badDeduct = await request(app)
      .post('/api/products/stock/deduct')
      .send({ orderId: 'ord-test-4', items: [] });
    expect(badDeduct.status).toBe(400);
    expect(badDeduct.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(badDeduct.body.error.details)).toBe(true);
  });

  it('exposes prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
  });
});
