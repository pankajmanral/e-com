import type { User, Address, DatastoreMode } from '@ecommerce/shared';

export interface CreateUserInput {
  fullName: string;
  email: string;
  phone?: string;
  address: Address;
}

export interface ResolveResult {
  user: User;
  created: boolean;
}

/**
 * Persistence contract for the user service. Two implementations exist:
 * `MemoryUserStore` (fallback, seeded in-process) and `MongoUserStore`
 * (primary datastore when MONGODB_URI is configured).
 */
export interface UserStoreApi {
  readonly mode: DatastoreMode;
  list(limit?: number): Promise<User[]>;
  get(id: string): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  create(input: CreateUserInput): Promise<User>;
  /** Find by email or create — the checkout identity operation. */
  resolve(input: CreateUserInput): Promise<ResolveResult>;
  count(): Promise<number>;
}
