import type { Logger } from 'pino';
import { AppError } from '@ecommerce/shared';
import type { OpsConfig } from '../config';
import {
  compareSnapshots,
  type Experiment,
  type ExperimentProvider,
  type ExperimentType,
  type OpsStateStore,
  type Snapshot,
} from '../store';
import { checkChaosGuard, evaluateGuard, type ContextGetter, type GuardConfig } from './guard';
import {
  createChaosMeshProvider,
  createIstioProvider,
  createKubectlContextGetter,
  createKubectlRunner,
  createLocalProvider,
  type ChaosProvider,
  type ProviderContext,
} from './providers';
import type { FetchLike } from '../metrics/store';

export interface StartExperimentInput {
  type: ExperimentType;
  target: string;
  durationSec: number;
  delayMs: number;
  provider: 'auto' | Exclude<ExperimentProvider, 'auto'>;
}

export interface ChaosManagerOptions {
  config: OpsConfig;
  store: OpsStateStore;
  /** Captures a fresh snapshot (metrics + health) — wired by deps.ts. */
  captureSnapshot: (label: string) => Promise<Snapshot>;
  fetchFn?: FetchLike;
  contextGetter?: ContextGetter;
  kubectlRunner?: (args: string[], options?: { input?: string; timeoutMs?: number }) => Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    missing: boolean;
  }>;
  logger?: Logger;
  now?: () => number;
  /** Timer scheduler (injectable for tests; defaults to unref'd setTimeout). */
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
}

/** Turns the config into the pure guard's view. */
export function guardConfigFrom(config: OpsConfig): GuardConfig {
  return {
    chaosEnabled: config.chaosEnabled,
    chaosMode: config.chaosMode,
    chaosAllowPattern: config.chaosAllowPattern,
    allowedTargets: config.services.map((s) => s.name),
  };
}

/**
 * Orchestrates chaos experiments end-to-end:
 *   guard → before-snapshot → provider start → timer → provider stop →
 *   after-snapshot → delta. State survives restarts: the same finalization is
 *   re-driven (reconcile) on every GET /chaos poll, so a restarted ops-service
 *   still completes experiments that elapsed while it was down.
 */
export class ChaosManager {
  private readonly config: OpsConfig;
  private readonly store: OpsStateStore;
  private readonly captureSnapshot: (label: string) => Promise<Snapshot>;
  private readonly guardConfig: GuardConfig;
  private readonly getContext: ContextGetter;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => { cancel: () => void };
  private readonly logger: Logger | undefined;
  private readonly providers: Record<Exclude<ExperimentProvider, 'auto'>, ChaosProvider>;
  private readonly timers = new Map<string, { cancel: () => void }>();
  private readonly finalizing = new Set<string>();

  constructor(options: ChaosManagerOptions) {
    this.config = options.config;
    this.store = options.store;
    this.captureSnapshot = options.captureSnapshot;
    this.guardConfig = guardConfigFrom(options.config);
    this.logger = options.logger;
    this.now = options.now ?? Date.now;

    const runner = options.kubectlRunner ?? createKubectlRunner(options.config.kubectlBin);
    const fetchFn: FetchLike = options.fetchFn ?? ((url: string, init?: RequestInit) => fetch(url, init));
    this.getContext =
      options.contextGetter ?? createKubectlContextGetter(options.config.kubectlBin, 3_000);
    this.providers = {
      local: createLocalProvider(fetchFn),
      istio: createIstioProvider(runner),
      'chaos-mesh': createChaosMeshProvider(runner),
    };
    this.schedule =
      options.schedule ??
      ((fn, ms) => {
        const timer = setTimeout(fn, ms);
        timer.unref();
        return { cancel: () => clearTimeout(timer) };
      });
  }

  /** Resolves `auto` to a concrete provider name. */
  resolveProvider(requested: 'auto' | Exclude<ExperimentProvider, 'auto'>): Exclude<ExperimentProvider, 'auto'> {
    if (requested !== 'auto') return requested;
    return this.config.chaosMode === 'k8s' ? this.config.chaosDefaultProvider : 'local';
  }

  /** Status-level guard check for GET /status. */
  checkStatusGuard(): Promise<Awaited<ReturnType<typeof evaluateGuard>>> {
    return evaluateGuard(this.guardConfig, this.getContext);
  }

  async start(input: StartExperimentInput): Promise<Experiment> {
    const outcome = await checkChaosGuard(input.target, this.guardConfig, this.getContext);
    if (!outcome.allowed) {
      throw new AppError(outcome.status, outcome.code, outcome.message);
    }

    const provider = this.resolveProvider(input.provider);
    const before = await this.captureSnapshot(`before-chaos-${input.target}`);
    const experiment = this.store.createExperiment(
      {
        type: input.type,
        target: input.target,
        provider,
        durationSec: input.durationSec,
        ...(input.type === 'network-latency' ? { delayMs: input.delayMs } : {}),
      },
      new Date(this.now()),
    );
    this.store.updateExperiment(experiment.id, { beforeSnapshotId: before.id });

    const ctx = this.context(experiment);
    const started = await this.providers[provider].start(ctx);
    this.store.appendExperimentLog(experiment.id, [`[${provider} start]`, ...started.log]);

    if (!started.ok) {
      const failure = this.store.updateExperiment(experiment.id, {
        status: 'failed',
        stoppedAt: new Date(this.now()).toISOString(),
        error: started.error ?? 'provider failed to start the experiment',
      });
      if (started.faultDisabled) {
        throw new AppError(
          409,
          'FAULT_INJECTION_DISABLED',
          `Fault injection is disabled on ${input.target}. Start that service with FAULT_INJECTION_ENABLED=true (local lab mode only) or use a k8s chaos provider.`,
        );
      }
      if (started.unreachable) {
        throw new AppError(
          503,
          'CHAOS_TARGET_UNREACHABLE',
          `The local chaos provider could not reach ${ctx.targetBaseUrl}/internal/fault. Make sure ${input.target} is running before starting an experiment.`,
        );
      }
      throw new AppError(502, 'CHAOS_PROVIDER_FAILED', `Chaos provider '${provider}' failed: ${started.error ?? 'unknown error'}`);
    }

    this.armTimer(experiment.id, Math.max(0, this.parseIso(experiment.endsAt) - this.now()));
    return this.store.getExperiment(experiment.id) ?? experiment;
  }

  /** Stops a running experiment immediately (idempotent). */
  async stop(id: string): Promise<Experiment> {
    const experiment = this.store.getExperiment(id);
    if (!experiment) throw AppError.notFound(`Experiment '${id}'`);
    if (experiment.status !== 'running') return experiment;
    await this.finalize(experiment, 'stopped');
    return this.store.getExperiment(id) ?? experiment;
  }

  get(id: string): Experiment | undefined {
    return this.store.getExperiment(id);
  }

  list(): { active: Experiment[]; recent: Experiment[] } {
    const all = this.store.listExperiments();
    return {
      active: all.filter((e) => e.status === 'running'),
      recent: all.filter((e) => e.status !== 'running').slice(0, 20),
    };
  }

  /** Re-drives finalization for elapsed experiments (restart resilience). */
  async reconcile(): Promise<void> {
    for (const experiment of this.store.listRunningExperiments()) {
      if (this.now() >= this.parseIso(experiment.endsAt)) {
        await this.finalize(experiment, 'completed');
      }
    }
  }

  /** Schedules timers for experiments restored from the state file. */
  resumeTimers(): void {
    for (const experiment of this.store.listRunningExperiments()) {
      const remaining = this.parseIso(experiment.endsAt) - this.now();
      this.armTimer(experiment.id, Math.max(0, remaining));
    }
  }

  private armTimer(id: string, ms: number): void {
    this.timers.get(id)?.cancel();
    const handle = this.schedule(() => {
      this.timers.delete(id);
      const experiment = this.store.getExperiment(id);
      if (experiment?.status === 'running') void this.finalize(experiment, 'completed');
    }, ms);
    this.timers.set(id, handle);
  }

  private async finalize(experiment: Experiment, status: 'completed' | 'stopped'): Promise<void> {
    if (this.finalizing.has(experiment.id) || experiment.status !== 'running') return;
    this.finalizing.add(experiment.id);
    try {
      this.timers.get(experiment.id)?.cancel();
      this.timers.delete(experiment.id);

      const ctx = this.context(experiment);
      const stopped = await this.providers[experiment.provider].stop(ctx);
      this.store.appendExperimentLog(experiment.id, [`[${experiment.provider} stop]`, ...stopped.log]);
      if (!stopped.ok) {
        this.logger?.warn({ experiment: experiment.id, error: stopped.error }, 'provider stop reported a failure');
      }

      let after: Snapshot | undefined;
      try {
        after = await this.captureSnapshot(`after-${experiment.id}`);
      } catch (error) {
        this.logger?.warn({ err: error, experiment: experiment.id }, 'after-snapshot failed');
      }

      const before = experiment.beforeSnapshotId ? this.store.getSnapshot(experiment.beforeSnapshotId) : undefined;
      this.store.updateExperiment(experiment.id, {
        status,
        stoppedAt: new Date(this.now()).toISOString(),
        ...(after ? { afterSnapshotId: after.id, delta: before ? compareSnapshots(before, after) : undefined } : {}),
      });
    } finally {
      this.finalizing.delete(experiment.id);
    }
  }

  private context(experiment: Experiment): ProviderContext {
    const target = this.config.services.find((s) => s.name === experiment.target);
    return {
      experimentId: experiment.id,
      target: experiment.target,
      targetBaseUrl: target?.baseUrl ?? '',
      type: experiment.type,
      durationSec: experiment.durationSec,
      delayMs: experiment.delayMs ?? 2_000,
      namespace: this.config.chaosNamespace,
      kubectlBin: this.config.kubectlBin,
    };
  }

  private parseIso(value: string): number {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : this.now();
  }
}
