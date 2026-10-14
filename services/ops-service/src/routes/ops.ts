import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler, validateBody, validateQuery } from '@ecommerce/shared';
import type { OpsDeps } from '../deps';
import { parseWindowSec } from '../deps';
import { compareSnapshots, type Experiment, type Snapshot } from '../store';

type Validated<T> = T extends z.ZodType<infer O> ? O : never;

const windowQuerySchema = z.object({
  window: z
    .string()
    .regex(/^\d+[smhd]$/, "window must look like '5m', '90s', '1h' or '24h'")
    .default('5m'),
});

function windowSeconds(query: Validated<typeof windowQuerySchema>): number {
  return parseWindowSec(query.window, 300);
}

/**
 * Business router mounted at `/api/ops`. All paths below are relative to it.
 */
export function createOpsRouter(deps: OpsDeps): Router {
  const router: Router = Router();

  // GET /health — aggregate health of every observed service.
  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const report = await deps.probeHealth();
      res.json(report);
    }),
  );

  // GET /status — what mode the control plane is in and which backends answer.
  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      const [guard, kubectlContext, prometheusAvailable] = await Promise.all([
        deps.chaos.checkStatusGuard(),
        deps.contextGetter(),
        deps.prometheus.isAvailable(),
      ]);
      res.json({
        mode: deps.config.chaosMode,
        chaosEnabled: deps.config.chaosEnabled,
        chaosGuard: guard.allowed
          ? { allowed: true, reason: guard.reason }
          : { allowed: false, reason: guard.message },
        clusterContext: kubectlContext.available ? kubectlContext.context : null,
        kubectlAvailable: kubectlContext.available,
        prometheus: { url: deps.config.prometheusUrl, available: prometheusAvailable },
        jaegerUrl: deps.config.jaegerUrl,
        services: deps.config.services.map((s) => s.name),
      });
    }),
  );

  // GET /metrics?window=5m — current view (Prometheus when ready, else scrape).
  router.get(
    '/metrics',
    validateQuery(windowQuerySchema),
    asyncHandler(async (req, res) => {
      const query = (req as unknown as { validatedQuery: Validated<typeof windowQuerySchema> }).validatedQuery;
      const windowSec = windowSeconds(query);
      const result = await deps.metricsCurrent(windowSec);
      res.json({ source: result.source, window: query.window, services: result.services });
    }),
  );

  // GET /metrics/history?window=15m — time series for the dashboard charts.
  router.get(
    '/metrics/history',
    validateQuery(windowQuerySchema),
    asyncHandler(async (req, res) => {
      const query = (req as unknown as { validatedQuery: Validated<typeof windowQuerySchema> }).validatedQuery;
      const windowSec = windowSeconds(query);
      const result = await deps.metricsHistory(windowSec);
      res.json({ source: result.source, window: query.window, series: result.series });
    }),
  );

  // POST /snapshots — capture a before/after checkpoint (metrics + health).
  router.post(
    '/snapshots',
    validateBody(z.object({ label: z.string().trim().min(1).max(120).optional() })),
    asyncHandler(async (req, res) => {
      const body = req.body as { label?: string };
      const snapshot = await deps.captureSnapshot(body.label);
      res.status(201).json(snapshot);
    }),
  );

  // GET /snapshots — newest first, capped at 50.
  router.get('/snapshots', (_req, res) => {
    res.json({ items: deps.state.listSnapshots() });
  });

  // DELETE /snapshots — clear the snapshot history.
  router.delete('/snapshots', (_req, res) => {
    res.json({ cleared: deps.state.clearSnapshots() });
  });

  // GET /compare/:beforeId/:afterId — metric-by-metric delta between snapshots.
  router.get('/compare/:beforeId/:afterId', (req, res) => {
    const before = deps.state.getSnapshot(req.params.beforeId);
    if (!before) throw AppError.notFound(`Snapshot '${req.params.beforeId}'`);
    const after = deps.state.getSnapshot(req.params.afterId);
    if (!after) throw AppError.notFound(`Snapshot '${req.params.afterId}'`);
    res.json({ before, after, delta: compareSnapshots(before, after) });
  });

  // POST /chaos — start an experiment (auto-captures a before-snapshot).
  router.post(
    '/chaos',
    validateBody(
      z.object({
        type: z.enum(['pod-failure', 'network-latency', 'service-outage']),
        // free-form on purpose: the guard produces a precise 400 for targets
        // outside the allow-list
        target: z.string().trim().min(1).max(80),
        durationSec: z.coerce.number().int().min(10).max(600).default(60),
        delayMs: z.coerce.number().int().min(50).max(30_000).default(2_000).optional(),
        provider: z.enum(['auto', 'local', 'istio', 'chaos-mesh']).default('auto'),
      }),
    ),
    asyncHandler(async (req, res) => {
      const body = req.body as {
        type: 'pod-failure' | 'network-latency' | 'service-outage';
        target: string;
        durationSec: number;
        delayMs?: number;
        provider: 'auto' | 'local' | 'istio' | 'chaos-mesh';
      };
      const experiment = await deps.chaos.start({
        type: body.type,
        target: body.target,
        durationSec: body.durationSec,
        delayMs: body.delayMs ?? 2_000,
        provider: body.provider,
      });
      res.status(201).json(experiment);
    }),
  );

  // GET /chaos — running experiments plus the last 20 finished ones.
  router.get(
    '/chaos',
    asyncHandler(async (_req, res) => {
      await deps.chaos.reconcile();
      res.json(deps.chaos.list());
    }),
  );

  // GET /chaos/:id — one experiment incl. before/after snapshot ids and delta.
  router.get('/chaos/:id', (req, res) => {
    const experiment = deps.chaos.get(req.params.id);
    if (!experiment) throw AppError.notFound(`Experiment '${req.params.id}'`);
    res.json(withSnapshots(deps, experiment));
  });

  // POST /chaos/:id/stop — end early, capturing the after-snapshot + delta.
  router.post(
    '/chaos/:id/stop',
    asyncHandler(async (req, res) => {
      await deps.chaos.reconcile();
      const experiment = await deps.chaos.stop(String(req.params.id));
      res.json(withSnapshots(deps, experiment));
    }),
  );

  return router;
}

/** Attaches the resolved before/after snapshots for the dashboard. */
function withSnapshots(deps: OpsDeps, experiment: Experiment): Record<string, unknown> {
  const before: Snapshot | null = experiment.beforeSnapshotId
    ? (deps.state.getSnapshot(experiment.beforeSnapshotId) ?? null)
    : null;
  const after: Snapshot | null = experiment.afterSnapshotId
    ? (deps.state.getSnapshot(experiment.afterSnapshotId) ?? null)
    : null;
  return { ...experiment, beforeSnapshot: before, afterSnapshot: after };
}
