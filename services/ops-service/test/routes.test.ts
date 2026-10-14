import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { buildDeps, type OpsDeps } from '../src/deps';
import { loadConfig, type EnvLike } from '../src/config';
import { ChaosManager } from '../src/chaos/manager';
import { MetricsStore, type FetchLike } from '../src/metrics/store';
import { PrometheusClient } from '../src/metrics/prometheus';
import { OpsStateStore, type Snapshot } from '../src/store';
import type { HealthReport } from '../src/health';

// keep pino quiet during tests
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';

const HEALTH_OK: HealthReport = {
  overall: 'healthy',
  checkedAt: new Date().toISOString(),
  services: [
    { name: 'user-service', baseUrl: 'http://127.0.0.1:4001', status: 'up', latencyMs: 3, version: '1.0.0', httpStatus: 200 },
    { name: 'product-service', baseUrl: 'http://127.0.0.1:4002', status: 'up', latencyMs: 4, version: '1.0.0', httpStatus: 200 },
    { name: 'order-service', baseUrl: 'http://127.0.0.1:4003', status: 'up', latencyMs: 2, version: '1.0.0', httpStatus: 200 },
  ],
};

const failingFetch: FetchLike = async (url) => {
  throw new Error(`ECONNREFUSED ${url}`);
};

interface FaultCall {
  method: string;
  url: string;
  body?: unknown;
}

/** Fake target service /internal/fault endpoints. */
function faultStub(options: { mode: 'ok' | 'disabled' | 'unreachable' } = { mode: 'ok' }) {
  const calls: FaultCall[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (options.mode === 'unreachable') throw new Error(`ECONNREFUSED ${url}`);
    if (options.mode === 'disabled') {
      return new Response(
        JSON.stringify({
          error: {
            code: 'FAULT_INJECTION_DISABLED',
            message: 'Fault injection is disabled on product-service. Set FAULT_INJECTION_ENABLED=true (local lab mode only).',
          },
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }
    if (method === 'POST') {
      return new Response(JSON.stringify({ service: 'product-service', fault: { type: 'latency' } }), { status: 201 });
    }
    return new Response(JSON.stringify({ cleared: true }), { status: 200 });
  };
  return { calls, fetchFn };
}

interface Harness {
  app: ReturnType<typeof createApp>['app'];
  deps: OpsDeps;
  faultCalls: FaultCall[];
}

function makeHarness(options: { env?: EnvLike; fault?: ReturnType<typeof faultStub> } = {}): Harness {
  const dir = mkdtempSync(path.join(tmpdir(), 'ops-service-test-'));
  const config = loadConfig({
    CHAOS_MODE: 'local',
    PROMETHEUS_URL: 'http://127.0.0.1:59999', // nothing listens here
    ...options.env,
  });
  const state = new OpsStateStore({ filePath: path.join(dir, 'ops-state.json') });
  const metricsStore = new MetricsStore({
    targets: config.services,
    intervalMs: 60_000, // never started; tests drive scrapeOnce directly
    historyPoints: 100,
    fetchFn: failingFetch,
  });
  const prometheus = new PrometheusClient({ url: config.prometheusUrl, fetchFn: failingFetch });

  const fault = options.fault ?? faultStub();
  const base = buildDeps({
    config,
    state,
    metricsStore,
    prometheus,
    probeHealth: async () => HEALTH_OK,
    contextGetter: async () => ({ available: true, context: 'desktop' }),
  });
  const chaos = new ChaosManager({
    config,
    store: state,
    captureSnapshot: base.captureSnapshot,
    fetchFn: fault.fetchFn,
    contextGetter: base.contextGetter,
  });
  const deps: OpsDeps = { ...base, chaos };
  return { app: createApp(deps).app, deps, faultCalls: fault.calls };
}

describe('ops-service API', () => {
  let harness: Harness;

  afterEach(() => {
    harness.deps.metricsStore.stop();
  });

  describe('health + status', () => {
    it('aggregates service health', async () => {
      harness = makeHarness();
      const res = await request(harness.app).get('/api/ops/health');
      expect(res.status).toBe(200);
      expect(res.body.overall).toBe('healthy');
      expect(res.body.services).toHaveLength(3);
      expect(res.body.services[0]).toMatchObject({ name: 'user-service', status: 'up' });
      expect(res.body.checkedAt).toBeTruthy();
    });

    it('reports platform status with a disabled chaos guard', async () => {
      harness = makeHarness();
      const res = await request(harness.app).get('/api/ops/status');
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('local');
      expect(res.body.chaosEnabled).toBe(false);
      expect(res.body.chaosGuard.allowed).toBe(false);
      expect(res.body.chaosGuard.reason).toContain('CHAOS_ENABLED=true');
      expect(res.body.clusterContext).toBe('desktop');
      expect(res.body.kubectlAvailable).toBe(true);
      expect(res.body.prometheus).toEqual({ url: 'http://127.0.0.1:59999', available: false });
      expect(res.body.services).toEqual(['user-service', 'product-service', 'order-service']);
    });
  });

  describe('metrics (scrape fallback)', () => {
    it('works even when every target endpoint is down', async () => {
      harness = makeHarness();
      await harness.deps.metricsStore.scrapeOnce(); // all three scrapes fail silently
      const res = await request(harness.app).get('/api/ops/metrics?window=5m');
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('scrape');
      expect(res.body.window).toBe('5m');
      expect(res.body.services).toHaveLength(3);
      expect(res.body.services[0]).toMatchObject({ service: 'user-service', requestsPerSec: 0, errorRate: 0, p95LatencyMs: 0 });
    });

    it('serves history with a stable shape', async () => {
      harness = makeHarness();
      const res = await request(harness.app).get('/api/ops/metrics/history?window=15m');
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('scrape');
      expect(res.body.window).toBe('15m');
      expect(Array.isArray(res.body.series)).toBe(true);
      expect(res.body.series[0]).toMatchObject({ service: 'user-service', points: [] });
    });

    it('rejects a malformed window', async () => {
      harness = makeHarness();
      const res = await request(harness.app).get('/api/ops/metrics?window=banana');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('snapshots + compare', () => {
    it('creates, lists, compares and clears snapshots', async () => {
      harness = makeHarness();
      const first = await request(harness.app).post('/api/ops/snapshots').send({ label: 'baseline' });
      expect(first.status).toBe(201);
      expect(first.body.id).toBe('snap-1');
      expect(first.body.label).toBe('baseline');
      expect(first.body.source).toBe('scrape');
      expect(first.body.health.overall).toBe('healthy');
      expect(first.body.health.perService['product-service']).toBe('up');

      const second = await request(harness.app).post('/api/ops/snapshots').send({});
      expect(second.status).toBe(201);
      expect(second.body.label).toMatch(/^snapshot-/);

      const list = await request(harness.app).get('/api/ops/snapshots');
      expect(list.status).toBe(200);
      expect(list.body.items.map((s: Snapshot) => s.id)).toEqual(['snap-2', 'snap-1']);

      const compare = await request(harness.app).get('/api/ops/compare/snap-1/snap-2');
      expect(compare.status).toBe(200);
      expect(compare.body.before.id).toBe('snap-1');
      expect(compare.body.after.id).toBe('snap-2');
      expect(compare.body.delta).toHaveLength(9); // 3 services x 3 metrics
      expect(compare.body.delta[0]).toMatchObject({ service: 'user-service', metric: 'requestsPerSec', before: 0, after: 0, delta: 0 });
      expect(compare.body.delta[0].deltaPct).toBeNull(); // before === 0

      const missing = await request(harness.app).get('/api/ops/compare/snap-1/snap-999');
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');

      const cleared = await request(harness.app).delete('/api/ops/snapshots');
      expect(cleared.status).toBe(200);
      expect(cleared.body.cleared).toBe(2);
    });
  });

  describe('chaos — disabled', () => {
    it('rejects starting an experiment with 403 CHAOS_FORBIDDEN', async () => {
      harness = makeHarness();
      const res = await request(harness.app)
        .post('/api/ops/chaos')
        .send({ type: 'network-latency', target: 'product-service', durationSec: 10, delayMs: 1500 });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CHAOS_FORBIDDEN');
      expect(res.body.error.message).toContain('CHAOS_ENABLED=true');
      expect(res.body.error.message).toContain('local test environments');
    });
  });

  describe('chaos — enabled (local provider)', () => {
    beforeEach(() => {
      harness = makeHarness({ env: { CHAOS_ENABLED: 'true' }, fault: faultStub() });
    });

    it('starts an experiment, captures a before-snapshot and injects the fault', async () => {
      const res = await request(harness.app)
        .post('/api/ops/chaos')
        .send({ type: 'network-latency', target: 'product-service', durationSec: 10, delayMs: 1500 });
      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^chaos-/);
      expect(res.body).toMatchObject({
        type: 'network-latency',
        target: 'product-service',
        provider: 'local',
        durationSec: 10,
        delayMs: 1500,
        status: 'running',
      });
      expect(res.body.endsAt).toBeTruthy();
      expect(res.body.beforeSnapshotId).toBeTruthy();

      const before = await request(harness.app).get(`/api/ops/snapshots`);
      expect(before.body.items.some((s: Snapshot) => s.id === res.body.beforeSnapshotId)).toBe(true);

      const post = harness.faultCalls.find((c) => c.method === 'POST');
      expect(post?.url).toBe('http://127.0.0.1:4002/internal/fault');
      expect(post?.body).toMatchObject({ type: 'latency', durationSec: 10, delayMs: 1500 });

      const list = await request(harness.app).get('/api/ops/chaos');
      expect(list.status).toBe(200);
      expect(list.body.active).toHaveLength(1);
      expect(list.body.recent).toHaveLength(0);
    });

    it('stops an experiment with an after-snapshot and delta', async () => {
      const started = await request(harness.app)
        .post('/api/ops/chaos')
        .send({ type: 'network-latency', target: 'product-service', durationSec: 30, delayMs: 900 });
      const id = started.body.id as string;

      const stopped = await request(harness.app).post(`/api/ops/chaos/${id}/stop`);
      expect(stopped.status).toBe(200);
      expect(stopped.body.status).toBe('stopped');
      expect(stopped.body.stoppedAt).toBeTruthy();
      expect(stopped.body.afterSnapshotId).toBeTruthy();
      expect(stopped.body.afterSnapshotId).not.toBe(stopped.body.beforeSnapshotId);
      expect(Array.isArray(stopped.body.delta)).toBe(true);
      expect(stopped.body.delta).toHaveLength(9);
      expect(stopped.body.beforeSnapshot).toBeTruthy();
      expect(stopped.body.afterSnapshot).toBeTruthy();
      expect(harness.faultCalls.some((c) => c.method === 'DELETE')).toBe(true);

      const detail = await request(harness.app).get(`/api/ops/chaos/${id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.status).toBe('stopped');
      expect(detail.body.beforeSnapshot.id).toBe(stopped.body.beforeSnapshotId);
      expect(detail.body.afterSnapshot.id).toBe(stopped.body.afterSnapshotId);

      const list = await request(harness.app).get('/api/ops/chaos');
      expect(list.body.active).toHaveLength(0);
      expect(list.body.recent).toHaveLength(1);

      const again = await request(harness.app).post(`/api/ops/chaos/${id}/stop`);
      expect(again.status).toBe(200); // idempotent
      expect(again.body.status).toBe('stopped');
    });

    it('rejects targets outside the allow-list with 400', async () => {
      const res = await request(harness.app)
        .post('/api/ops/chaos')
        .send({ type: 'pod-failure', target: 'payment-service', durationSec: 30 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CHAOS_TARGET_NOT_ALLOWED');
    });

    it('validates durationSec bounds', async () => {
      const res = await request(harness.app)
        .post('/api/ops/chaos')
        .send({ type: 'pod-failure', target: 'product-service', durationSec: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for an unknown experiment', async () => {
      const res = await request(harness.app).get('/api/ops/chaos/chaos-999');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('chaos — provider errors', () => {
    it('responds 409 when the target has fault injection disabled', async () => {
      harness = makeHarness({ env: { CHAOS_ENABLED: 'true' }, fault: faultStub({ mode: 'disabled' }) });
      const res = await request(harness.app)
        .post('/api/ops/chaos')
        .send({ type: 'network-latency', target: 'product-service', durationSec: 10 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('FAULT_INJECTION_DISABLED');
      expect(res.body.error.message).toContain('FAULT_INJECTION_ENABLED=true');
    });

    it('responds 503 when the target is unreachable', async () => {
      harness = makeHarness({ env: { CHAOS_ENABLED: 'true' }, fault: faultStub({ mode: 'unreachable' }) });
      const res = await request(harness.app)
        .post('/api/ops/chaos')
        .send({ type: 'pod-failure', target: 'product-service', durationSec: 10 });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('CHAOS_TARGET_UNREACHABLE');
    });

    it('records the failed experiment for the dashboard', async () => {
      harness = makeHarness({ env: { CHAOS_ENABLED: 'true' }, fault: faultStub({ mode: 'disabled' }) });
      await request(harness.app)
        .post('/api/ops/chaos')
        .send({ type: 'service-outage', target: 'product-service', durationSec: 10 });
      const list = await request(harness.app).get('/api/ops/chaos');
      expect(list.body.active).toHaveLength(0);
      expect(list.body.recent).toHaveLength(1);
      expect(list.body.recent[0].status).toBe('failed');
      expect(list.body.recent[0].log.length).toBeGreaterThan(0);
    });
  });

  describe('platform endpoints', () => {
    it('still exposes /health and /metrics at the root', async () => {
      harness = makeHarness();
      const health = await request(harness.app).get('/health');
      expect(health.status).toBe(200);
      expect(health.body.service).toBe('ops-service');
      const metrics = await request(harness.app).get('/metrics');
      expect(metrics.status).toBe(200);
      expect(metrics.text).toContain('http_requests_total');
    });
  });
});
