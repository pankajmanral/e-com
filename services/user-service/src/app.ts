import { Router } from 'express';
import { createServiceApp, MongoManager, mongoConfigFromEnv, type ServiceApp } from '@ecommerce/shared';
import { createUsersRouter } from './routes/users';
import { createAuthRouter } from './routes/auth';
import { SessionStore } from '@ecommerce/shared';
import { createUserStore, type UserStoreApi } from './store';

export interface CreateUserAppOptions {
  /** Inject a store (tests use MemoryUserStore; index.ts passes the real one). */
  store?: UserStoreApi;
  /** Inject a session store (tests can pass a fresh one). */
  sessions?: SessionStore;
  /** Mongo manager used for the /health datastore report. */
  mongo?: MongoManager;
}

export function createUserApp(options: CreateUserAppOptions = {}): ServiceApp {
  const store = options.store ?? new (require('./store/memory').MemoryUserStore)();
  const sessions = options.sessions ?? new SessionStore();

  const usersRouter = createUsersRouter(store);
  const authRouter = createAuthRouter(store, sessions);

  const combined = Router();
  combined.use('/', usersRouter);
  combined.use('/auth', authRouter);

  return createServiceApp({
    name: 'user-service',
    version: '1.0.0',
    basePath: '/api',
    router: combined,
    healthDetails: () => ({
      datastore: store.mode,
      mongodb: options.mongo ? options.mongo.status() : { configured: false, connected: false, mode: 'memory' },
    }),
  });
}
