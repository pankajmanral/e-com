import './instrumentation';
import { createApp } from './app';
import { buildDeps } from './deps';
import { MongoManager, mongoConfigFromEnv } from '@ecommerce/shared';

async function main(): Promise<void> {
  const logger = (await import('@ecommerce/shared')).createLogger('ops-service');

  const mongo = new MongoManager(mongoConfigFromEnv('ops-service'));
  const db = await mongo.connect(logger);

  const deps = buildDeps();

  const { app, logger: svcLogger } = createApp(deps);

  const port = deps.config.port;
  const server = app.listen(port, () => {
    svcLogger.info(
      {
        port,
        mode: deps.config.chaosMode,
        chaosEnabled: deps.config.chaosEnabled,
        services: deps.config.services.map((s) => s.name),
        datastore: db !== null ? 'mongodb' : 'memory',
      },
      'ops-service listening',
    );
  });

  server.on('error', (error) => {
    svcLogger.fatal({ err: error }, 'server failed to start');
    process.exit(1);
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      svcLogger.info({ signal }, 'shutting down');
      deps.metricsStore.stop();
      server.close(() => process.exit(0));
      void mongo.close().finally(() => process.exit(0));
      setTimeout(() => process.exit(0), 5_000).unref();
    });
  }
}

void main().catch((error) => {
  console.error('ops-service failed to start', error);
  process.exit(1);
})