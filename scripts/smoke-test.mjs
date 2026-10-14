#!/usr/bin/env node
/**
 * End-to-end smoke test for the local development mode.
 *
 * Prerequisites: the four services are running (npm run dev) — the script can
 * also verify the Next.js app when it is running on :3000 (optional).
 *
 * Usage:  npm run smoke
 *         node scripts/smoke-test.mjs --skip-chaos
 */
import { setTimeout as sleep } from 'node:timers/promises';

const USER = process.env.USER_SERVICE_URL ?? 'http://localhost:4001';
const PRODUCT = process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:4002';
const ORDER = process.env.ORDER_SERVICE_URL ?? 'http://localhost:4003';
const OPS = process.env.OPS_SERVICE_URL ?? 'http://localhost:4004';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const skipChaos = process.argv.includes('--skip-chaos');

const results = [];
let failures = 0;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function waitFor(url, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(delayMs);
  }
  return false;
}

async function main() {
  console.log('\n=== Vantage Resilience Lab — smoke test ===\n');

  // 1. service liveness ------------------------------------------------------
  const services = [
    ['user-service', `${USER}/health`],
    ['product-service', `${PRODUCT}/health`],
    ['order-service', `${ORDER}/health`],
    ['ops-service', `${OPS}/health`],
  ];
  let datastore = 'unknown';
  for (const [name, url] of services) {
    const up = await waitFor(url, 5);
    record(`${name} is healthy`, up, url);
    if (up && name === 'user-service') {
      try {
        datastore = (await (await fetch(url)).json()).datastore ?? 'memory';
      } catch {
        /* ignore */
      }
    }
  }
  console.log(`(datastore mode: ${datastore} — set MONGODB_URI to use MongoDB)`);
  if (failures > 0) {
    console.error('\nServices are not reachable — start them with `npm run dev` first.\n');
    process.exit(1);
  }

  // 2. catalogue -------------------------------------------------------------
  const listRes = await fetch(`${PRODUCT}/api/products?perPage=5`);
  const list = await listRes.json();
  record('product list returns items', listRes.ok && Array.isArray(list.items) && list.items.length > 0, `${list.total} products`);
  record('product list pagination metadata', typeof list.pages === 'number' && typeof list.page === 'number');

  const first = list.items[0];
  const detailRes = await fetch(`${PRODUCT}/api/products/${first.id}`);
  const detail = detailRes.json ? await detailRes.json() : null;
  record('product detail by id', detailRes.ok && detail?.id === first.id);

  const searchRes = await fetch(`${PRODUCT}/api/products?search=${encodeURIComponent(first.name.split(' ')[0])}&perPage=48`);
  const search = (await searchRes.json()) ?? {};
  record('product search filters', searchRes.ok && (search.items?.length ?? 0) >= 1, `${search.items?.length ?? 0} matches`);

  // 3. checkout happy path ---------------------------------------------------
  const orderPayload = {
    customer: { fullName: 'Smoke Test', email: `smoke-${Date.now()}@example.com`, phone: '+44 7700 900123' },
    shippingAddress: { line1: '1 Test Street', city: 'London', postalCode: 'EC1A 1BB', country: 'United Kingdom' },
    items: [
      { productId: first.id, quantity: 2 },
      { productId: list.items[1].id, quantity: 1 },
    ],
    payment: { method: 'card', cardholderName: 'Smoke Test', cardNumber: '4242424242424242', expiryMMYY: '12/29', cvc: '123' },
  };
  const orderRes = await fetch(`${ORDER}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(orderPayload),
  });
  const order = await orderRes.json();
  const expectedSubtotal = Math.round((first.price * 2 + list.items[1].price) * 100) / 100;
  record('order created (201)', orderRes.status === 201 && typeof order.id === 'string', order.id);
  record(
    'order totals computed correctly',
    Math.abs(order.subtotal - expectedSubtotal) < 0.01,
    `subtotal ${order.subtotal} (expected ${expectedSubtotal})`,
  );
  record('order ships free over £100 or charges £6.95', order.shippingCost === 0 || order.shippingCost === 6.95);
  record('order includes trace id for Jaeger', typeof order.traceId === 'string' && order.traceId.length === 32, order.traceId);

  const fetched = await (await fetch(`${ORDER}/api/orders/${order.id}`)).json();
  record('order retrievable by id', fetched.id === order.id && fetched.items.length === 2);

  // stock was really deducted
  const afterDeduct = await (await fetch(`${PRODUCT}/api/products/${first.id}`)).json();
  record('stock deducted on product service', afterDeduct.stock === first.stock - 2, `${first.stock} → ${afterDeduct.stock}`);

  // 4. payment decline path --------------------------------------------------
  const declineRes = await fetch(`${ORDER}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...orderPayload, payment: { ...orderPayload.payment, cardNumber: '4000000000000002' } }),
  });
  record('declined card returns 402', declineRes.status === 402);

  // 5. validation ------------------------------------------------------------
  const invalidRes = await fetch(`${ORDER}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customer: { fullName: '', email: 'x' }, items: [], shippingAddress: {} }),
  });
  const invalidBody = await invalidRes.json();
  record('invalid payload returns 400 with details', invalidRes.status === 400 && Array.isArray(invalidBody.error?.details));

  // 6. user service ----------------------------------------------------------
  const users = await (await fetch(`${USER}/api/users`)).json();
  record('user service lists customers', users.total >= 8);
  const resolved = await fetch(`${USER}/api/users/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Returning Smoke',
      email: 'amelia.hartley@example.com',
      address: { line1: '18 Marine Parade', city: 'Brighton', postalCode: 'BN2 1TL', country: 'United Kingdom' },
    }),
  });
  record('user resolve returns existing customer', resolved.ok && (await resolved.json()).created === false);

  // 7. ops service -----------------------------------------------------------
  const opsHealth = await (await fetch(`${OPS}/api/ops/health`)).json();
  record('ops aggregate health', Array.isArray(opsHealth.services) && opsHealth.services.length === 3, opsHealth.overall);
  const opsStatus = await (await fetch(`${OPS}/api/ops/status`)).json();
  record('ops status exposes mode + chaos guard', typeof opsStatus.mode === 'string' && typeof opsStatus.chaosEnabled === 'boolean');

  const snapshot = await fetch(`${OPS}/api/ops/snapshots`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'smoke-baseline' }),
  });
  const snapBody = await snapshot.json();
  record('metrics snapshot captured', snapshot.status === 201 && typeof snapBody.id === 'string', snapBody.id);

  // 8. chaos (local mode only) ----------------------------------------------
  if (!skipChaos && opsStatus.chaosEnabled && opsStatus.mode === 'local') {
    const exp = await (await fetch(`${OPS}/api/ops/chaos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'network-latency', target: 'product-service', durationSec: 20, delayMs: 700 }),
    })).json();
    record('chaos experiment accepted', typeof exp.id === 'string' && exp.status === 'running', `${exp.type} on ${exp.target}`);

    const t0 = Date.now();
    const slow = await (await fetch(`${PRODUCT}/api/products?perPage=1`, { signal: AbortSignal.timeout(5000) })).text();
    const elapsed = Date.now() - t0;
    record('latency fault degrades target', elapsed >= 600 && Boolean(slow), `${elapsed}ms response time`);

    const stopped = await fetch(`${OPS}/api/ops/chaos/${exp.id}/stop`, { method: 'POST' });
    record('chaos experiment stoppable', stopped.ok);

    await sleep(1500);
    const t1 = Date.now();
    await fetch(`${PRODUCT}/api/products?perPage=1`, { signal: AbortSignal.timeout(5000) });
    record('target recovers after stop', Date.now() - t1 < 600, `${Date.now() - t1}ms`);
  } else {
    console.log('[SKIP] chaos experiment (enable with CHAOS_ENABLED=true CHAOS_MODE=local, or pass no --skip-chaos)');
  }

  // 9. optional: frontend ----------------------------------------------------
  try {
    const webRes = await fetch(WEB, { signal: AbortSignal.timeout(2000) });
    const html = await webRes.text();
    record('frontend responds', webRes.ok && html.includes('Vantage'), WEB);
  } catch {
    console.log('[SKIP] frontend not running (start with npm run dev)');
  }

  // summary ------------------------------------------------------------------
  const passed = results.length - failures;
  console.log(`\n=== ${passed}/${results.length} checks passed${failures ? `, ${failures} FAILED` : ' 🎉'} ===\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
