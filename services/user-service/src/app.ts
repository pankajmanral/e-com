import { createServiceApp, MongoManager, mongoConfigFromEnv, type ServiceApp } from '@ecommerce/shared';
import { createUsersRouter } from './routes/users';
import { MemoryUserStore, type UserStoreApi } from './store';

export interface CreateUserAppOptions {
  /** Inject a store (tests use MemoryUserStore; index.ts passes the real one). */
  store?: UserStoreApi;
  /** Mongo manager used for the /health datastore report. */
  mongo?: MongoManager;
}

export function createUserApp(options: CreateUserAppOptions = {}): ServiceApp {
  const store = options.store ?? new MemoryUserStore();
  const mongo = options.mongo ?? new MongoManager(mongoConfigFromEnv('user-service'));

  return createServiceApp({
    name: 'user-service',
    version: '1.0.0',
    basePath: '/api',
    router: createUsersRouter(store),
    healthDetails: () => ({
      datastore: store.mode,
      mongodb: mongo.status(),
    }),
  });
}
