import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError, validateBody, withSpan } from '@ecommerce/shared';
import type { UserStoreApi } from '../store';
import { SessionStore, type Session, type UserRole } from '@ecommerce/shared';

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  address: z.object({
    line1: z.string().trim().min(3).max(120),
    line2: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2).max(80),
    postalCode: z.string().trim().min(2).max(20),
    country: z.string().trim().min(2).max(80),
  }),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** Session cookie name. */
export const SESSION_COOKIE = 'vantage_session';

export function createAuthRouter(store: UserStoreApi, sessions: SessionStore): Router {
  const authRouter: Router = Router();

  /** POST /api/auth/register — create a new customer (or admin) account. */
  authRouter.post('/register', validateBody(registerSchema), async (req, res) => {
    const input = req.body as z.infer<typeof registerSchema>;
    return withSpan('user.register', async () => {
      if (await store.findByEmail(input.email)) {
        throw AppError.conflict(`A user with email '${input.email}' already exists`);
      }
      const user = await store.create({
        ...input,
        role: 'customer',
        address: input.address,
      });
      const { passwordHash, salt, ...safeUser } = user;
      res.status(201).json({ user: safeUser });
    });
  });

  /** POST /api/auth/login — validate credentials and issue a session token. */
  authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    return withSpan('user.login', async () => {
      const user = await store.findByCredentials(email, password);
      if (!user) {
        throw AppError.unauthorized('Invalid email or password');
      }
      const session = sessions.create(user.id, user.email, user.role ?? 'customer');
      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
      );
      res.json({
        token: session.token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role ?? 'customer',
        },
      });
    });
  });

  /** POST /api/auth/logout — clear the session cookie. */
  authRouter.post('/logout', async (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    res.json({ ok: true });
  });

  /** GET /api/auth/me — return the current session's user (or 401). */
  authRouter.get('/me', authenticate(sessions), async (req, res) => {
    const session = (req as unknown as { session: Session }).session;
    res.json({
      user: {
        id: session.userId,
        email: session.email,
        role: session.role,
      },
    });
  });

  return authRouter;
}

/**
 * Express middleware: reads the session cookie, validates it against the
 * session store, and attaches `req.session` and `req.user`.
 */
export function authenticate(sessions: SessionStore) {
  return (req: Request & { session?: Session; user?: { id: string; email: string; role: UserRole } },
    _res: Response,
    next: NextFunction): void => {
    const cookie = req.headers.cookie;
    let token: string | undefined;
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)vantage_session=([^;]+)/);
      if (match) token = match[1];
    }
    if (token) {
      const session = sessions.get(token);
      if (session) {
        req.session = session;
        req.user = { id: session.userId, email: session.email, role: session.role };
      }
    }
    next();
  };
}

/** Require an authenticated session. Returns 401 if missing. */
export function requireAuth() {
  return (req: Request & { session?: Session }, _res: Response, next: NextFunction): void => {
    if (!req.session) {
      throw AppError.unauthorized('Authentication required');
    }
    next();
  };
}

/** Require one of the given roles. Returns 401 if unauthenticated, 403 if wrong role. */
export function requireRoles(...allowed: UserRole[]) {
  return (req: Request & { session?: Session }, _res: Response, next: NextFunction): void => {
    if (!req.session) {
      throw AppError.unauthorized('Authentication required');
    }
    if (!allowed.includes(req.session.role)) {
      throw AppError.forbidden('Insufficient privileges');
    }
    next();
  };
}
