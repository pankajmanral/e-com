import type { Db, Logger } from '@ecommerce/shared';
import { MemoryUserStore } from './memory';
import { MongoUserStore } from './mongo';
import type { UserStoreApi } from './types';

export * from './types';
export { MemoryUserStore } from './memory';
export { MongoUserStore } from './mongo';

/**
 * Store selection: MongoDB when a live Db handle was obtained at boot,
 * otherwise the seeded in-memory fallback. The mode is surfaced on /health.
 */
export async function createUserStore(db: Db | null, logger?: Logger): Promise<UserStoreApi> {
  if (db) return MongoUserStore.create(db, logger);
  return new MemoryUserStore();
}
