import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler, validateBody, validateQuery, withSpan } from '@ecommerce/shared';
import type { ProductStore } from '../store';

const listQuerySchema = z.object({
  search: z.string().trim().min(1).max(80).optional(),
  category: z.enum(['audio', 'wearables', 'accessories', 'home-tech', 'mobile']).optional(),
  sort: z.enum(['featured', 'price-asc', 'price-desc', 'rating', 'newest']).default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
  featured: z.enum(['true', 'false']).optional(),
});

const stockItemsSchema = z
  .array(
    z.object({
      productId: z.string().trim().min(1).max(64),
      quantity: z.number().int().min(1).max(1000),
    }),
  )
  .min(1)
  .max(200);

const stockSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  items: stockItemsSchema,
});

function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery?: T }).validatedQuery as T;
}

/** Catalogue router; the store is injected so tests can isolate state. */
export function createProductsRouter(store: ProductStore): Router {
  const router: Router = Router();

  /** GET /api/products - filter, sort and paginate the catalogue. */
  router.get('/products', validateQuery(listQuerySchema), (req, res) => {
    const query = validatedQuery<z.infer<typeof listQuerySchema>>(req);
    return res.json(
      store.list({
        search: query.search,
        category: query.category,
        sort: query.sort,
        page: query.page,
        perPage: query.perPage,
        featured: query.featured === 'true',
      }),
    );
  });

  // NOTE: /products/stats must be registered before /products/:id.
  /** GET /api/products/stats - dashboard counters for the admin app. */
  router.get('/products/stats', (_req, res) => {
    return res.json(store.stats());
  });

  /** GET /api/products/:id - accepts a product id or a slug. */
  router.get('/products/:id', (req, res) => {
    const product = store.getByIdOrSlug(req.params.id);
    if (!product) throw AppError.notFound('Product');
    return res.json(product);
  });

  /** GET /api/categories - category slugs with counts and price ranges. */
  router.get('/categories', (_req, res) => {
    return res.json(store.categories());
  });

  /**
   * POST /api/products/stock/deduct - atomic all-or-nothing reservation used
   * by the order service. Any shortage rejects the whole request untouched.
   */
  router.post(
    '/products/stock/deduct',
    validateBody(stockSchema),
    asyncHandler(async (req, res) => {
      const { orderId, items } = req.body as z.infer<typeof stockSchema>;
      return res.json(store.deduct(orderId, items));
    }),
  );

  /**
   * POST /api/products/stock/restore - compensating rollback for the checkout
   * saga. Unknown products are skipped so replays are always safe.
   */
  router.post(
    '/products/stock/restore',
    validateBody(stockSchema),
    asyncHandler(async (req, res) => {
      const { orderId, items } = req.body as z.infer<typeof stockSchema>;
      return res.json(store.restore(orderId, items));
    }),
  );

  return router;
}