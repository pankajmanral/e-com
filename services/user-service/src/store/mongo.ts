import { type Db, type Collection } from 'mongodb';
import type { User, Logger } from '@ecommerce/shared';
import { nextSequenceId } from '@ecommerce/shared';
import { SEED_USERS } from '../data/users';
import type { CreateUserInput, ResolveResult, UserStoreApi } from './types';

/** Mongo document shape: the string business id doubles as `_id`. */
type UserDoc = { _id: string } & Omit<User, 'id'>;

/**
 * MongoDB-backed user store (database: `vantage_user_service`,
 * collection: `users`). Documents carry the string id as `_id` so lookups are
 * single-index reads. Seeding is idempotent: applied only when the collection
 * is empty (first boot), and the id sequence is aligned with the seed ids.
 */
export class MongoUserStore implements UserStoreApi {
  readonly mode = 'mongodb' as const;
  private readonly col: Collection<UserDoc>;

  constructor(
    private readonly db: Db,
    private readonly logger?: Logger,
  ) {
    this.col = db.collection<UserDoc>('users');
  }

  static async create(db: Db, logger?: Logger): Promise<MongoUserStore> {
    const store = new MongoUserStore(db, logger);
    await store.init();
    return store;
  }

  private async init(): Promise<void> {
    await this.col.createIndex({ email: 1 }, { unique: true });
    await this.col.createIndex({ fullName: 1 });
    const count = await this.col.countDocuments();
    if (count === 0) {
      try {
        await this.col.insertMany(SEED_USERS.map((u) => ({ ...u, _id: u.id })), { ordered: false });
        this.logger?.info({ seeded: SEED_USERS.length }, 'seeded users collection');
      } catch (error) {
        // duplicate keys -> another instance seeded concurrently; harmless
        this.logger?.debug({ err: error }, 'users seed skipped (already seeded)');
      }
      // keep generated ids above the seeded range (usr-1001..)
      await this.db
        .collection<{ _id: string; seq: number }>('counters')
        .updateOne({ _id: 'users' }, { $max: { seq: 1000 + SEED_USERS.length } }, { upsert: true });
    }
  }

  private toUser(doc: UserDoc | null | undefined): User | undefined {
    if (!doc) return undefined;
    const { _id, ...rest } = doc;
    return { ...rest, id: _id };
  }

  async list(limit = 50): Promise<User[]> {
    const docs = await this.col.find({}).sort({ fullName: 1 }).limit(limit).toArray();
    return docs.map((d) => this.toUser(d)!);
  }

  async get(id: string): Promise<User | undefined> {
    return this.toUser(await this.col.findOne({ _id: id }));
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.toUser(await this.col.findOne({ email: email.toLowerCase() }));
  }

  async create(input: CreateUserInput): Promise<User> {
    const id = await nextSequenceId(this.db, 'users', 'usr');
    const user: User = {
      id,
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      ...(input.phone ? { phone: input.phone } : {}),
      address: input.address,
      createdAt: new Date().toISOString(),
    };
    await this.col.insertOne({ ...user, _id: id });
    return user;
  }

  async resolve(input: CreateUserInput): Promise<ResolveResult> {
    const email = input.email.toLowerCase();
    const updated = await this.col.findOneAndUpdate(
      { email },
      {
        $set: {
          fullName: input.fullName,
          address: input.address,
          ...(input.phone ? { phone: input.phone } : {}),
        },
      },
      { returnDocument: 'after' },
    );
    const existing = this.toUser(updated);
    if (existing) return { user: existing, created: false };
    return { user: await this.create({ ...input, email }), created: true };
  }

  async count(): Promise<number> {
    return this.col.countDocuments();
  }
}
