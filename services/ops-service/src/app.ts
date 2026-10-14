import { createServiceApp } from '@ecommerce/shared';
import { buildDeps, type OpsDeps } from './deps';
import { createOpsRouter } from './routes/ops';

/**
 * Builds the ops-service express app. Passing partial deps lets tests inject
 * fake stores / providers; production (src/index.ts) uses the defaults.
 */
export function createApp(overrides: Partial<OpsDeps> = {}) {
  const deps = buildDeps(overrides);
  return createServiceApp({
    name: 'ops-service',
    version: deps.config.version,
    // platform /health stays at the root; the aggregate one lives here
    basePath: '/api/ops',
    router: createOpsRouter(deps),
  });
}

export { buildDeps };
export type { OpsDeps };
