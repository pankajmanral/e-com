import './instrumentation';
import { createLogger, MongoManager, mongoConfigFromEnv } from '@ecommerce/shared';
import { createUserApp } from './app';
import { createUserStore } from './store';

async function main(): Promise<void> {
  const logger = createLogger('user-service');

  // MongoDB is the primary datastore; the service falls back to its in-memory
  // store when no database is reachable (unless MONGODB_REQUIRED=true).
  const mongo = new MongoManager(mongoConfigFromEnv('user-service'));
  const db = await mongo.connect(logger);
  const store = await createUserStore(db, logger);
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