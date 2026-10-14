import type { User } from '@ecommerce/shared';
import { SEED_USERS } from '../data/users';
import type { CreateUserInput, ResolveResult, UserStoreApi } from './types';

/**
 * In-memory fallback store (used when MongoDB is not configured/reachable).
 * Seeded at boot; new checkout customers are created on demand.
 */
export class MemoryUserStore implements UserStoreApi {
  readonly mode = 'memory' as const;
  private readonly users = new Map<string, User>();
  private counter = 0;

  constructor(seed: User[] = SEED_USERS) {
    for (const user of seed) this.users.set(user.id, user);
    this.counter = this.users.size;
  }

  async list(limit = 50): Promise<User[]> {
    return Array.from(this.users.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, limit);
  }

  async get(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase();
    return Array.from(this.users.values()).find((user) => user.email.toLowerCase() === normalized);
  }

  async create(input: CreateUserInput): Promise<User> {
    this.counter += 1;
    const user: User = {
      id: `usr-${1000 + this.counter}`,
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      ...(input.phone ? { phone: input.phone } : {}),
      address: input.address,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async resolve(input: CreateUserInput): Promise<ResolveResult> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      // keep delivery details fresh for returning customers
      const updated: User = {
        ...existing,
        fullName: input.fullName,
        address: input.address,
        ...(input.phone ? { phone: input.phone } : {}),
      };
      this.users.set(existing.id, updated);
      return { user: updated, created: false };
    }
    return { user: await this.create(input), created: true };
  }

  async count(): Promise<number> {
    return this.users.size;
  }
}
