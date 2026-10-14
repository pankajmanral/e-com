import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { MongoManager } from '@ecommerce/shared';
import { createUserApp } from '../src/app';
import { MemoryUserStore } from '../src/store';

const { app } = createUserApp({ store: new MemoryUserStore() });

describe('user-service API', () => {
  it('reports health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('user-service');
  });

  it('lists seeded users', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(8);
    expect(res.body.items[0]).toHaveProperty('email');
  });

  it('returns 404 for an unknown user', async () => {
    const res = await request(app).get('/api/users/usr-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects an invalid payload with validation details', async () => {
    const res = await request(app)
      .post('/api/users/resolve')
      .send({ fullName: 'A', email: 'not-an-email', address: { line1: '', city: '', postalCode: '', country: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('resolves a returning customer by email', async () => {
    const res = await request(app)
      .post('/api/users/resolve')
      .send({
        fullName: 'Amelia H. Hartley',
        email: 'amelia.hartley@example.com',
        address: { line1: '19 Marine Parade', city: 'Brighton', postalCode: 'BN2 1TL', country: 'United Kingdom' },
      });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.user.id).toBe('usr-1001');
  });

  it('creates a new customer on resolve', async () => {
    const res = await request(app)
      .post('/api/users/resolve')
      .send({
        fullName: 'Test Customer',
        email: `test-${Date.now()}@example.com`,
        address: { line1: '1 Test Way', city: 'Leeds', postalCode: 'LS1 1AA', country: 'United Kingdom' },
      });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.user.id).toMatch(/^usr-/);
  });

  it('exposes prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
  });

  it('reports the datastore mode on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.datastore).toBe('memory');
    expect(res.body.mongodb.mode).toBe('memory');
    expect(res.body.mongodb.configured).toBe(false);
  });
});

describe('MongoDB fallback behaviour', () => {
  afterEach(() => {
    delete process.env.MONGODB_URI;
    delete process.env.MONGODB_REQUIRED;
  });

  it('falls back to the memory store when MongoDB is unreachable', async () => {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:59999/?serverSelectionTimeoutMS=250';
    process.env.MONGODB_REQUIRED = 'false';
    const manager = new MongoManager({
      service: 'user-service',
      uri: process.env.MONGODB_URI,
      dbName: 'vantage_user_service_test',
      required: false,
      serverSelectionTimeoutMS: 250,
    });
    const db = await manager.connect();
    expect(db).toBeNull();
    const status = manager.status();
    expect(status.configured).toBe(true);
    expect(status.connected).toBe(false);
    expect(status.mode).toBe('memory');
    expect(status.error).toBeTruthy();
    await manager.close();
  });

  it('fails fast when MongoDB is required but unreachable', async () => {
    const manager = new MongoManager({
      service: 'user-service',
      uri: 'mongodb://127.0.0.1:59999',
      required: true,
      serverSelectionTimeoutMS: 250,
    });
    await expect(manager.connect()).rejects.toThrow(/required for user-service/i);
  });
});
