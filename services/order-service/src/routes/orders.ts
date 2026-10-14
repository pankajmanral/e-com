import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import {
  AppError,
  asyncHandler,
  createLogger,
  currentTraceId,
  validateBody,
  validateQuery,
  withRetry,
  withSpan,
} from '@ecommerce/shared';
import type { Order, OrderItem, Product, User } from '@ecommerce/shared';
import type { OrderDeps } from '../deps';
import { CURRENCY, computeTotals, lineTotal } from '../pricing';
import { PaymentGateway, paymentGateway } from '../services/payment-gateway';
import type { OrderStore } from '../store';

const logger: ReturnType<typeof createLogger> = createLogger('order-service');

const addressSchema = z.object({
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(2).max(20),
  country: z.string().trim().min(2).max(80),
});

const paymentSchema = z
  .object({
    method: z.enum(['card', 'paypal', 'cod']),
    cardholderName: z.string().trim().min(2).max(120).optional(),
    cardNumber: z.string().trim().max(32).optional(),
    expiryMMYY: z.string().trim().max(5).optional(),
    cvc: z.string().trim().max(4).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method !== 'card') return;

    const requireField = (field: 'cardholderName' | 'cardNumber' | 'expiryMMYY' | 'cvc') => {
      if (!value[field]) {
        ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required when method is 'card'` });
      }
    };
    requireField('cardholderName');
    requireField('cardNumber');
    requireField('expiryMMYY');
    requireField('cvc');

    if (value.cardNumber && !/^\d[\d\s-]{10,30}$/.test(value.cardNumber)) {
      ctx.addIssue({ code: 'custom', path: ['cardNumber'], message: 'cardNumber must be 12-19 digits' });
    }
    if (value.expiryMMYY && !/^(0[1-9]|1[0-2])\/?\d{2}$/.test(value.expiryMMYY)) {
      ctx.addIssue({ code: 'custom', path: ['expiryMMYY'], message: 'expiryMMYY must be MM/YY' });
    }
    if (value.cvc && !/^\d{3,4}$/.test(value.cvc)) {
      ctx.addIssue({ code: 'custom', path: ['cvc'], message: 'cvc must be 3 or 4 digits' });
    }
  });

const createOrderSchema = z.object({
  customer: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().min(5).max(30).optional(),
  }),
  shippingAddress: addressSchema,
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(30),
  payment: paymentSchema,
});

const listQuerySchema = z.object({
  userId: z.string().trim().min(1).max(64).optional(),
  email: z.string().trim().toLowerCase().max(254).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type CreateOrderInput = z.infer<typeof createOrderSchema>;

function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery?: T }).validatedQuery as T;
}

interface HealthPing {
  status: 'ok' | 'down';
  latencyMs?: number;
  error?: string;
}

/** Lightweight `GET /health` probe with a hard 2s budget. */
async function pingHealth(baseUrl: string): Promise<HealthPing> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const latencyMs = Date.now() - startedAt;
    return response.ok ? { status: 'ok', latencyMs } : { status: 'down', latencyMs, error: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'down', latencyMs: Date.now() - startedAt, error: (error as Error)?.message ?? 'unknown error' };
  } finally {
    clearTimeout(timer);
  }
}

export interface OrdersRouterOptions {
  store: OrderStore;
  deps: OrderDeps;
  /** Override the mock payment gateway (tests / future real PSP adapter). */
  gateway?: PaymentGateway;
}

export function createOrdersRouter(options: OrdersRouterOptions): Router {
  const { store, deps } = options;
  const gateway = options.gateway ?? paymentGateway;
  const router: Router = Router();

  // NOTE: /orders/stats and /orders/deps must be registered before /orders/:id.

  /** GET /api/orders/stats — revenue counters for the admin dashboard. */
  router.get('/orders/stats', (_req, res) => {
    res.json(store.stats());
  });

  /** GET /api/orders/deps — live dependency health + circuit-breaker snapshots. */
  router.get(
    '/orders/deps',
    asyncHandler(async (_req, res) => {
      const clients = [deps.users, deps.products];
      const probes = await Promise.allSettled(clients.map((client) => pingHealth(client.baseUrl)));

      const dependencies = clients.map((client, index) => {
        const settled = probes[index];
        const health: HealthPing =
          settled.status === 'fulfilled'
            ? settled.value
            : { status: 'down', error: String((settled as PromiseRejectedResult).reason) };
        return {
          service: client.service,
          baseUrl: client.baseUrl,
          circuitBreaker: client.getBreakerSnapshot(),
          health: { ...health, checkedAt: new Date().toISOString() },
        };
      });

      res.json({ dependencies });
    }),
  );

  /**
   * POST /api/orders — full checkout saga:
   *   resolve customer → fetch products → price → charge → reserve stock → persist
   * Stock reservation is compensated with a restore call if it fails after the
   * payment was captured (see catch block below).
   */
  router.post(
    '/orders',
    validateBody(createOrderSchema),
    asyncHandler(async (req, res) => {
      const input = req.body as CreateOrderInput;

      const order: Order = await withSpan('order.create', async () => {
        const orderId = `ord-${Date.now().toString(36)}`;

        // 1. resolve-or-create the customer (transient upstream errors retried)
        const resolved = await withRetry(
          () =>
            deps.users.post<{ user: User; created: boolean }>('/api/users/resolve', {
              fullName: input.customer.fullName,
              email: input.customer.email,
              ...(input.customer.phone ? { phone: input.customer.phone } : {}),
              address: input.shippingAddress,
            }),
          { retries: 2 },
        );

        // 2. fetch every product — an unknown id aborts before stock/payment
        const lines = await Promise.all(
          input.items.map(async (item) => {
            try {
              const product = await withRetry(
                () => deps.products.get<Product>(`/api/products/${encodeURIComponent(item.productId)}`),
                { retries: 2 },
              );
              return { requested: item, product };
            } catch (error) {
              if (error instanceof AppError && error.statusCode === 404) {
                throw AppError.notFound(`Product '${item.productId}'`);
              }
              throw error;
            }
          }),
        );

        // 3. pure pricing (unit-tested in src/pricing.ts)
        const items: OrderItem[] = lines.map(({ requested, product }) => ({
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: requested.quantity,
          lineTotal: lineTotal(product.price, requested.quantity),
        }));
        const totals = computeTotals(items);

        // 4. capture payment (mock gateway — see src/services/payment-gateway.ts)
        await gateway.charge({ amount: totals.total, currency: CURRENCY, payment: input.payment });

        // 5. reserve stock; if that fails after capture, compensate with restore
        const stockPayload = {
          orderId,
          items: input.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        };
        try {
          await deps.products.post('/api/products/stock/deduct', stockPayload);
        } catch (error) {
          logger.error({ err: error, orderId }, 'stock deduction failed after payment — attempting compensation');
          try {
            await deps.products.post('/api/products/stock/restore', stockPayload);
            logger.warn({ orderId }, 'compensation restore succeeded');
          } catch (restoreError) {
            logger.error({ err: restoreError, orderId }, 'compensation restore failed — manual intervention required');
          }
          throw AppError.unavailable(
            'product-service',
            `Stock reservation failed on product-service for order '${orderId}'; payment captured — compensation attempted`,
          );
        }

        // 6. assemble the confirmed order
        const created: Order = {
          id: orderId,
          userId: resolved.user.id,
          items,
          ...totals,
          currency: CURRENCY,
          status: 'confirmed',
          customer: { fullName: input.customer.fullName, email: input.customer.email },
          shippingAddress: input.shippingAddress,
          createdAt: new Date().toISOString(),
          traceId: currentTraceId(),
        };

        // 7. persist atomically to the JSON store
        store.add(created);
        return created;
      });

      const traceId = order.traceId ?? currentTraceId();
      if (traceId) res.setHeader('x-trace-id', traceId);
      res.status(201).json(order);
    }),
  );

  /** GET /api/orders — newest first, optionally filtered by userId or email. */
  router.get('/orders', validateQuery(listQuerySchema), (req, res) => {
    const query = validatedQuery<z.infer<typeof listQuerySchema>>(req);
    res.json(store.list({ userId: query.userId, email: query.email, limit: query.limit }));
  });

  /** GET /api/orders/:id — a single order. */
  router.get('/orders/:id', (req, res) => {
    const order = store.get(req.params.id);
    if (!order) throw AppError.notFound(`Order '${req.params.id}'`);
    res.json(order);
  });

  return router;
}
