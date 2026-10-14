import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from 'pino';
import type { OverallStatus, ServiceStatus } from './health';

export type MetricsSource = 'prometheus' | 'scrape';
export type ExperimentType = 'pod-failure' | 'network-latency' | 'service-outage';
export type ExperimentProvider = 'local' | 'istio' | 'chaos-mesh';
export type ExperimentStatus = 'running' | 'completed' | 'stopped' | 'failed';

export interface SnapshotServiceMetrics {
  service: string;
  requestsPerSec: number;
  errorRate: number;
  p95LatencyMs: number;
}

export interface Snapshot {
  id: string;
  label: string;
  createdAt: string;
  source: MetricsSource;
  services: SnapshotServiceMetrics[];
  health: {
    overall: OverallStatus;
    perService: Record<string, ServiceStatus>;
  };
}

export interface DeltaRow {
  service: string;
  metric: string;
  before: number;
  after: number;
  delta: number;
  /** Percentage change relative to `before`; `null` when `before` is 0. */
  deltaPct: number | null;
}

export interface Experiment {
  id: string;
  type: ExperimentType;
  target: string;
  provider: ExperimentProvider;
  durationSec: number;
  delayMs?: number;
  status: ExperimentStatus;
  startedAt: string;
  endsAt: string;
  stoppedAt?: string;
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
  delta?: DeltaRow[];
  log: string[];
  error?: string;
}

export interface OpsState {
  snapshotSeq: number;
  experimentSeq: number;
  snapshots: Snapshot[];
  experiments: Experiment[];
}

const MAX_STORED_SNAPSHOTS = 50;
const MAX_STORED_EXPERIMENTS = 50;
const MAX_LOG_LINES = 20;

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10_000) / 10_000;
  return rounded === 0 ? 0 : rounded;
}

/** Absolute path of the persisted state file (`data/ops-state.json`). */
export function defaultStatePath(): string {
  return path.join(__dirname, '..', 'data', 'ops-state.json');
}

/** Appends log output to an experiment keeping the last 20 lines. */
export function pushLog(existing: string[], lines: string[]): string[] {
  const additions = lines
    .flatMap((line) => line.split(/\r?\n/))
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (additions.length === 0) return existing;
  return [...existing, ...additions].slice(-MAX_LOG_LINES);
}

/** Metric rows between two snapshots (used by /compare and experiment delta). */
export const COMPARED_METRICS = ['requestsPerSec', 'errorRate', 'p95LatencyMs'] as const;

export function compareSnapshots(before: Snapshot, after: Snapshot): DeltaRow[] {
  const rows: DeltaRow[] = [];
  const services: string[] = [];
  for (const entry of before.services) if (!services.includes(entry.service)) services.push(entry.service);
  for (const entry of after.services) if (!services.includes(entry.service)) services.push(entry.service);

  for (const service of services) {
    const beforeEntry = before.services.find((s) => s.service === service);
    const afterEntry = after.services.find((s) => s.service === service);
    for (const metric of COMPARED_METRICS) {
      const beforeValue = beforeEntry ? round4(beforeEntry[metric]) : 0;
      const afterValue = afterEntry ? round4(afterEntry[metric]) : 0;
      const delta = round4(afterValue - beforeValue);
      rows.push({
        service,
        metric,
        before: beforeValue,
        after: afterValue,
        delta,
        deltaPct: beforeValue !== 0 ? Math.round((delta / Math.abs(beforeValue)) * 10_000) / 100 : null,
      });
    }
  }
  return rows;
}

export interface OpsStateStoreOptions {
  filePath?: string;
  logger?: Logger;
}

/**
 * JSON-file backed store for snapshots and chaos experiments. Writes are
 * atomic (temp file + rename) and serialized so a crash never leaves a
 * half-written state file behind.
 */
export class OpsStateStore {
  readonly filePath: string;
  private readonly logger: Logger | undefined;
  private state: OpsState = { snapshotSeq: 0, experimentSeq: 0, snapshots: [], experiments: [] };
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: OpsStateStoreOptions = {}) {
    this.filePath = options.filePath ?? defaultStatePath();
    this.logger = options.logger;
  }

  /** Loads persisted state; a missing/corrupt file simply resets the store. */
  async init(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<OpsState>;
      this.state = {
        snapshotSeq: Number.isFinite(parsed.snapshotSeq) ? Number(parsed.snapshotSeq) : 0,
        experimentSeq: Number.isFinite(parsed.experimentSeq) ? Number(parsed.experimentSeq) : 0,
        snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
        experiments: Array.isArray(parsed.experiments) ? parsed.experiments : [],
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        this.logger?.warn({ err: error, file: this.filePath }, 'could not read ops state — starting fresh');
      }
      this.state = { snapshotSeq: 0, experimentSeq: 0, snapshots: [], experiments: [] };
    }
  }

  private persist(): void {
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeQueue = this.writeQueue
      .then(async () => {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        await writeFile(tmp, snapshot, 'utf8');
        await rename(tmp, this.filePath);
      })
      .catch((error: unknown) => {
        this.logger?.error({ err: error, file: this.filePath }, 'failed to persist ops state');
      });
  }

  // ---------------------------------------------------------------- snapshots

  addSnapshot(input: Omit<Snapshot, 'id' | 'createdAt'>): Snapshot {
    this.state.snapshotSeq += 1;
    const snapshot: Snapshot = {
      id: `snap-${this.state.snapshotSeq}`,
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.state.snapshots.push(snapshot);
    while (this.state.snapshots.length > MAX_STORED_SNAPSHOTS) this.state.snapshots.shift();
    this.persist();
    return snapshot;
  }

  getSnapshot(id: string): Snapshot | undefined {
    return this.state.snapshots.find((s) => s.id === id);
  }

  /** Newest first, capped at 50. */
  listSnapshots(): Snapshot[] {
    return [...this.state.snapshots].reverse().slice(0, 50);
  }

  clearSnapshots(): number {
    const cleared = this.state.snapshots.length;
    this.state.snapshots = [];
    this.persist();
    return cleared;
  }

  // -------------------------------------------------------------- experiments

  createExperiment(
    input: Pick<Experiment, 'type' | 'target' | 'provider' | 'durationSec'> & { delayMs?: number },
    startedAt: Date,
  ): Experiment {
    this.state.experimentSeq += 1;
    const experiment: Experiment = {
      id: `chaos-${this.state.experimentSeq}`,
      status: 'running',
      startedAt: startedAt.toISOString(),
      endsAt: new Date(startedAt.getTime() + input.durationSec * 1_000).toISOString(),
      log: [],
      ...input,
    };
    this.state.experiments.push(experiment);
    while (this.state.experiments.length > MAX_STORED_EXPERIMENTS) this.state.experiments.shift();
    this.persist();
    return experiment;
  }

  updateExperiment(id: string, patch: Partial<Experiment>): Experiment | undefined {
    const experiment = this.state.experiments.find((e) => e.id === id);
    if (!experiment) return undefined;
    Object.assign(experiment, patch);
    this.persist();
    return experiment;
  }

  /** Appends provider output to an experiment's log (max 20 lines). */
  appendExperimentLog(id: string, lines: string[]): Experiment | undefined {
    const experiment = this.state.experiments.find((e) => e.id === id);
    if (!experiment) return undefined;
    experiment.log = pushLog(experiment.log, lines);
    this.persist();
    return experiment;
  }

  getExperiment(id: string): Experiment | undefined {
    return this.state.experiments.find((e) => e.id === id);
  }

  listExperiments(): Experiment[] {
    return [...this.state.experiments].reverse();
  }

  listRunningExperiments(): Experiment[] {
    return this.state.experiments.filter((e) => e.status === 'running');
  }
}
