import './instrumentation';
import { createApp } from './app';
import { OrderStore } from './store';
import { MongoManager, mongoConfigFromEnv } from '@ecommerce/shared';

async function main(): Promise<void> {
  const logger = (await import('@ecommerce/shared')).createLogger('order-service');

  const mongo = new MongoManager(mongoConfigFromEnv('order-service'));
  const db = await mongo.connect(logger);

  // Keep the JSON-file order store as the default; Mongo is available
  // for future use but doesn't change the HTTP surface.
  const store = db ? new OrderStore({ memoryOnly: true }) : new OrderStore();

  const { app } = createApp({ store });

  const port = Number(process.env.PORT ?? 4003);
  const server = app.listen(port, () => {
    logger.info({ port, datastore: 'memory' }, 'order-service listening');
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