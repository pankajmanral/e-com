import { Router } from 'express';
import { z } from 'zod';
import { AppError, validateBody, validateQuery, withSpan } from '@ecommerce/shared';
import type { UserStoreApi } from '../store';

const addressSchema = z.object({
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(2).max(20),
  country: z.string().trim().min(2).max(80),
});

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(5).max(30).optional(),
  address: addressSchema,
});

const resolveSchema = createUserSchema;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function createUsersRouter(store: UserStoreApi): Router {
  const usersRouter: Router = Router();

  /** GET /api/users — list customers (used by the admin dashboard). */
  usersRouter.get('/users', validateQuery(listQuerySchema), async (req, res) => {
    const { limit } = (req as unknown as { validatedQuery: { limit: number } }).validatedQuery;
    const items = await store.list(limit);
    res.json({ items, total: await store.count() });
  });

  /** GET /api/users/:id — customer profile (used for order prefill). */
  usersRouter.get('/users/:id', async (req, res) => {
    const user = await store.get(req.params.id);
    if (!user) throw AppError.notFound(`User '${req.params.id}'`);
    res.json(user);
  });

  /** GET /api/users/:id/summary — profile + stats for the dashboard. */
  usersRouter.get('/users/:id/summary', async (req, res) => {
    const user = await store.get(req.params.id);
    if (!user) throw AppError.notFound(`User '${req.params.id}'`);
    res.json({
      user,
      stats: { knownSince: user.createdAt, emailVerified: true },
    });
  });

  /** POST /api/users — create a customer. */
  usersRouter.post('/users', validateBody(createUserSchema), async (req, res) => {
    const input = req.body as z.infer<typeof createUserSchema>;
    return withSpan('user.create', async () => {
      if (await store.findByEmail(input.email)) {
        throw AppError.conflict(`A user with email '${input.email}' already exists`);
      }
      const user = await store.create(input);
      res.status(201).json(user);
    });
  });

  /**
   * POST /api/users/resolve — "checkout identity" call used by the order
   * service: returns the existing customer for the email or creates one.
   */
  usersRouter.post('/users/resolve', validateBody(resolveSchema), async (req, res) => {
    const input = req.body as z.infer<typeof resolveSchema>;
    return withSpan('user.resolve', async () => {
      const { user, created } = await store.resolve(input);
      res.status(created ? 201 : 200).json({ user, created });
    });
  });

  /** POST /api/users/validate — lightweight existence check for order service. */
  usersRouter.post(
    '/users/validate',
    validateBody(z.object({ userId: z.string().trim().min(1) })),
    async (req, res) => {
      const { userId } = req.body as { userId: string };
      const user = await store.get(userId);
      if (!user) throw AppError.notFound(`User '${userId}'`);
      res.json({ valid: true, userId: user.id, fullName: user.fullName, email: user.email });
    },
  );

  return usersRouter;
}
