import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

export type FaultType = 'latency' | 'error' | 'pod-failure';

export interface FaultState {
  type: FaultType;
  /** Epoch millis when the fault auto-expires. */
  expiresAt: number;
  delayMs: number;
  startedAt: number;
  injectedBy: string;
}

export interface FaultInjector {
  middleware: RequestHandler;
  router: Router;
  isEnabled: boolean;
  getState: () => FaultState | null;
}

const faultBodySchema = z.object({
  type: z.enum(['latency', 'error', 'pod-failure']),
  /** How long the fault stays active. */
  durationSec: z.coerce.number().int().min(1).max(900).default(60),
  /** Delay applied per request in latency mode. */
  delayMs: z.coerce.number().int().min(50).max(30_000).default(2_000),
});

/**
 * Kubernetes-style fault injection for the *local* (non-cluster) lab mode.
 *
 * The ops-service calls `POST /internal/fault` on a target service which then
 * degrades itself for a bounded amount of time. In the full Kubernetes demo
 * mode the equivalent faults are injected by Istio (delay/abort) or Chaos Mesh
 * (PodChaos/NetworkChaos) instead — this keeps the lab demonstrable without a
 * cluster while preserving identical user-visible behaviour.
 */
export function createFaultInjector(options: { enabled: boolean; serviceName: string }): FaultInjector {
  const isEnabled = options.enabled;
  let state: FaultState | null = null;

  const current = (): FaultState | null => {
    if (state && Date.now() > state.expiresAt) state = null;
    return state;
  };

  const middleware: RequestHandler = async (req, res, next) => {
    // Metrics keep flowing even while the service is "failing", so dashboards
    // can record the degradation.
    if (req.path === '/metrics') return next();
    const active = current();
    if (!active) return next();

    if (active.type === 'latency') {
      await new Promise((resolve) => setTimeout(resolve, active.delayMs));
      res.setHeader('x-fault-injected', 'latency');
      return next();
    }

    // 'error' and 'pod-failure' both make the service unavailable. The pod
    // flavour adds Retry-After to mimic a restarting replica.
    res.setHeader('x-fault-injected', active.type);
    if (active.type === 'pod-failure') res.setHeader('retry-after', '5');
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: `${options.serviceName} is unavailable (chaos fault '${active.type}' active until ${new Date(active.expiresAt).toISOString()})`,
      },
    });
  };

  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ service: options.serviceName, enabled: isEnabled, fault: current() });
  });

  router.post('/', (req, res, next) => {
    if (!isEnabled) {
      res.status(404).json({
        error: {
          code: 'FAULT_INJECTION_DISABLED',
          message: `Fault injection is disabled on ${options.serviceName}. Set FAULT_INJECTION_ENABLED=true (local lab mode only).`,
        },
      });
      return;
    }
    const parsed = faultBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid fault specification',
          details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      });
      return;
    }
    const body = parsed.data;
    state = {
      type: body.type,
      delayMs: body.delayMs,
      startedAt: Date.now(),
      expiresAt: Date.now() + body.durationSec * 1000,
      injectedBy: (req.headers['x-injected-by'] as string) || 'manual',
    };
    res.status(201).json({ service: options.serviceName, fault: state });
  });

  router.delete('/', (_req, res) => {
    const previous = current();
    state = null;
    res.json({ service: options.serviceName, cleared: Boolean(previous), fault: null });
  });

  return { middleware, router, isEnabled, getState: current };
}
