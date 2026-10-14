import './instrumentation';
import { createApp } from './app';
import { productStore } from './store';

async function main(): Promise<void> {
  const logger = (await import('@ecommerce/shared')).createLogger('product-service');

  const mongo = new (await import('@ecommerce/shared')).MongoManager((await import('@ecommerce/shared')).mongoConfigFromEnv('product-service'));
  const db = await mongo.connect(logger);

  // If MongoDB is reachable we could swap in a MongoProductStore later;
  // for now keep the seeded memory store so the API surface is unchanged.
  const store = db ? productStore : productStore;

  const { app, logger: svcLogger } = createApp(store);

  const port = Number(process.env.PORT ?? 4002);
  const server = app.listen(port, () => {
    svcLogger.info({ port, datastore: store.mode }, 'product-service listening');
  });

  server.on('error', (error) => {
    svcLogger.fatal({ err: error }, 'server failed to start');
    process.exit(1);
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      svcLogger.info({ signal }, 'shutting down');
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