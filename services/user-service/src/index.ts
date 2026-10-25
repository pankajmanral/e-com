import './instrumentation';
import { createLogger, MongoManager, mongoConfigFromEnv } from '@ecommerce/shared';
import { createUserApp } from './app';
import { createUserStore } from './store';

const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_FULL_NAME = 'Lab Administrator';

async function main(): Promise<void> {
  const logger = createLogger('user-service');

  // MongoDB is the primary datastore; the service falls back to its in-memory
  // store when no database is reachable (unless MONGODB_REQUIRED=true).
  const mongo = new MongoManager(mongoConfigFromEnv('user-service'));
  const db = await mongo.connect(logger);
  const store = await createUserStore(db, logger);

  // Seed a default admin user so the admin dashboard can be password protected.
  // Idempotent: skipped when an admin already exists. The store hashes the
  // plaintext password before persisting.
  const existingAdmin = await store.findByEmail(ADMIN_EMAIL);
  if (!existingAdmin) {
    await store.create({
      fullName: ADMIN_FULL_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      address: {
        line1: '1 Admin Way',
        city: 'Admin City',
        postalCode: '00000',
        country: 'Adminland',
      },
    });
    logger.info({ email: ADMIN_EMAIL }, 'seeded default admin user');
  }

  const { app } = createUserApp({ store, mongo });

  const port = Number(process.env.PORT ?? 4001);

  const server = app.listen(port, () => {
    logger.info({ port, datastore: store.mode }, 'user-service listening');
  });

  server.on('error', (error) => {
    logger.fatal({ err: error }, 'server failed to start');
    process.exit(1);
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'shutting down');
      server.close(() => process.exit(0));
      void mongo.close().finally(() => process.exit(0));
      setTimeout(() => process.exit(0), 5_000).unref();
    });
  }
}

void main().catch((error) => {
  console.error('fatal boot error', error);
  process.exit(1);
})
