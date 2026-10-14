import { MongoClient, type Db } from 'mongodb';
import type { Logger } from 'pino';
import { AppError } from './errors';

/** Convenience re-exports so services never need mongodb/pino as direct type deps. */
export type { Db, Collection, Document } from 'mongodb';

/**
 * MongoDB integration for the services.
 *
 * Design goal: MongoDB is the *primary* datastore (Docker Compose and
 * Kubernetes wire MONGODB_URI for every service), but a service must still be
 * able to boot when no database is reachable so that the dependency-free
 * `npm run dev` mode keeps working. Therefore:
 *
 *   - MONGODB_URI unset            -> fallback store (in-memory / JSON file)
 *   - MONGODB_URI set, reachable   -> MongoDB-backed store
 *   - MONGODB_URI set, unreachable -> fallback store + warning, OR hard boot
 *                                     failure when MONGODB_REQUIRED=true
 *
 * Every service reports the active mode on /health as `datastore`, so the
 * admin dashboard and smoke tests can show which layer is in use.
 */

export type DatastoreMode = 'mongodb' | 'memory';

export interface MongoStatus {
  /** A URI was supplied via env. */
  configured: boolean;
  /** Connection established at boot. */
  connected: boolean;
  mode: DatastoreMode;
  /** URI with credentials redacted, safe to log/expose. */
  uri?: string;
  dbName?: string;
  required: boolean;
  error?: string;
}

export interface MongoManagerOptions {
  /** Logical service name, e.g. `user-service`. */
  service: string;
  uri?: string;
  dbName?: string;
  /** Fail boot (throw) instead of falling back when the connection fails. */
  required?: boolean;
  serverSelectionTimeoutMS?: number;
}

export function sanitizeMongoUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, '//***:***@');
}

export function mongoConfigFromEnv(service: string): MongoManagerOptions {
  const uri = process.env.MONGODB_URI?.trim();
  return {
    service,
    uri: uri || undefined,
    dbName: process.env.MONGODB_DB?.trim() || `vantage_${service.replace(/-/g, '_')}`,
    required: process.env.MONGODB_REQUIRED?.toLowerCase() === 'true',
    serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS ?? 3_000),
  };
}

export class MongoManager {
  readonly service: string;
  readonly dbName: string;
  readonly required: boolean;
  readonly serverSelectionTimeoutMS: number;
  private readonly uri?: string;
  private client?: MongoClient;
  private db?: Db;
  private connected = false;
  private lastError?: string;

  constructor(options: MongoManagerOptions) {
    this.service = options.service;
    this.uri = options.uri?.trim() || undefined;
    this.dbName = options.dbName ?? `vantage_${this.service.replace(/-/g, '_')}`;
    this.required = options.required ?? false;
    this.serverSelectionTimeoutMS = options.serverSelectionTimeoutMS ?? 3_000;
  }

  get configured(): boolean {
    return Boolean(this.uri);
  }

  /**
   * Attempts to connect. Returns the Db handle, or null when the service
   * should fall back to its local store. Throws only when `required`.
   */
  async connect(log?: Logger): Promise<Db | null> {
    if (!this.uri) {
      log?.info({ service: this.service }, 'MONGODB_URI not set — using local fallback store');
      return null;
    }
    try {
      this.client = new MongoClient(this.uri, {
        serverSelectionTimeoutMS: this.serverSelectionTimeoutMS,
        maxPoolSize: 10,
        minPoolSize: 0,
        retryWrites: true,
        appName: this.service,
      });
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      await this.db.command({ ping: 1 });
      this.connected = true;
      this.lastError = undefined;
      log?.info({ service: this.service, dbName: this.dbName }, 'connected to MongoDB');
      return this.db;
    } catch (error) {
      this.connected = false;
      this.lastError = (error as Error)?.message;
      if (this.required) {
        throw AppError.internal(
          `MongoDB is required for ${this.service} but unreachable at ${sanitizeMongoUri(this.uri)}: ${this.lastError}`,
        );
      }
      log?.warn(
        { service: this.service, err: error },
        'MongoDB unreachable — falling back to local store (set MONGODB_REQUIRED=true to fail fast)',
      );
      return null;
    }
  }

  getDb(): Db | null {
    return this.connected && this.db ? this.db : null;
  }

  status(): MongoStatus {
    return {
      configured: this.configured,
      connected: this.connected,
      mode: this.connected ? 'mongodb' : 'memory',
      ...(this.uri ? { uri: sanitizeMongoUri(this.uri) } : {}),
      dbName: this.dbName,
      required: this.required,
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } finally {
      this.connected = false;
      this.client = undefined;
      this.db = undefined;
    }
  }
}

/**
 * Allocates a human-readable, monotonic id like `usr-1042` using a Mongo
 * counter document (upsert on first use).
 */
export async function nextSequenceId(db: Db, collection: string, prefix: string, padding = 4): Promise<string> {
  type CounterDoc = { _id: string; seq: number };
  const counters = db.collection<CounterDoc>('counters');
  const doc = await counters.findOneAndUpdate(
    { _id: collection },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  const seq = doc?.seq ?? 1;
  return `${prefix}-${String(seq).padStart(padding, '0')}`;
}
