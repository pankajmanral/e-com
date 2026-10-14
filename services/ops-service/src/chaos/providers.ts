import { execFile, spawn } from 'node:child_process';
import type { ExperimentProvider, ExperimentType } from '../store';
import type { FetchLike } from '../metrics/store';
import type { ContextGetter, KubectlContext } from './guard';

export type { ContextGetter, KubectlContext };

export interface ProviderContext {
  /** Experiment id (`chaos-7`) — also used to derive resource names. */
  experimentId: string;
  target: string;
  targetBaseUrl: string;
  type: ExperimentType;
  durationSec: number;
  delayMs: number;
  namespace: string;
  kubectlBin: string;
}

export interface ProviderOutcome {
  ok: boolean;
  /** Provider output (kubectl stdout/stderr or HTTP results) for the UI. */
  log: string[];
  error?: string;
  /** Target answered 404 FAULT_INJECTION_DISABLED (local provider). */
  faultDisabled?: boolean;
  /** Target could not be reached at all (local provider). */
  unreachable?: boolean;
}

export interface ChaosProvider {
  name: Exclude<ExperimentProvider, 'auto'>;
  start(ctx: ProviderContext): Promise<ProviderOutcome>;
  stop(ctx: ProviderContext): Promise<ProviderOutcome>;
}

// ------------------------------------------------------------------- kubectl

export interface KubectlResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** True when the binary itself could not be executed (ENOENT). */
  missing: boolean;
}

export type KubectlRunner = (
  args: string[],
  options?: { input?: string; timeoutMs?: number },
) => Promise<KubectlResult>;

/**
 * Runs kubectl through `spawn`, feeding YAML on stdin (`kubectl apply -f -`).
 * Combined stdout/stderr lines are returned so they can be shown in the
 * dashboard; the process is killed after `timeoutMs` (default 15s).
 */
export function createKubectlRunner(bin: string): KubectlRunner {
  return (args, options = {}) =>
    new Promise<KubectlResult>((resolve) => {
      const timeoutMs = options.timeoutMs ?? 15_000;
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      const child = spawn(bin, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
      }, timeoutMs);
      timer.unref();

      const settle = (result: Omit<KubectlResult, 'timedOut' | 'missing'> & { missing?: boolean }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut, missing: result.missing ?? false, ...result });
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        settle({ code: null, stdout, stderr: `${stderr}${error.message}`.trim(), missing: error.code === 'ENOENT' });
      });
      child.on('close', (code) => {
        settle({ code, stdout, stderr });
      });

      if (options.input !== undefined) {
        child.stdin.on('error', () => {
          /* kubectl may exit before consuming stdin — ignore EPIPE */
        });
        child.stdin.end(options.input);
      } else {
        child.stdin.end();
      }
    });
}

/** `kubectl config current-context` (3s timeout) — used by guard + /status. */
export function createKubectlContextGetter(bin: string, timeoutMs = 3_000): ContextGetter {
  return () =>
    new Promise<KubectlContext>((resolve) => {
      execFile(
        bin,
        ['config', 'current-context'],
        { timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 },
        (error, stdout) => {
          if (error) {
            const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
            resolve({ available: !missing, context: null });
            return;
          }
          resolve({ available: true, context: stdout.trim() || null });
        },
      );
    });
}

function toLogLines(result: KubectlResult, prefix: string): string[] {
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  const lines = combined ? combined.split(/\r?\n/) : [];
  if (result.timedOut) lines.push(`${prefix}: timed out`);
  return lines.length > 0 ? lines : [`${prefix}: ok`];
}

// -------------------------------------------------------------- yaml builders

/** Resource name suffix from `chaos-7` → `7`. */
export function resourceSuffix(experimentId: string): string {
  return experimentId.replace(/^chaos-/, '') || experimentId;
}

/** Istio VirtualService with a 100% fault (delay or abort) on one host. */
export function buildVirtualServiceYaml(ctx: ProviderContext): string {
  const fault =
    ctx.type === 'network-latency'
      ? `      fault:
        delay:
          fixedDelay: ${Math.round(ctx.delayMs)}ms
          percent: 100`
      : `      fault:
        abort:
          httpStatus: 503
          percent: 100`;
  const host = `${ctx.target}.${ctx.namespace}.svc.cluster.local`;
  return `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: chaos-fault-${ctx.target}-${resourceSuffix(ctx.experimentId)}
  namespace: ${ctx.namespace}
  labels:
    app: ${ctx.target}
    chaos-lab: ops-service
    chaos-experiment: ${ctx.experimentId}
spec:
  hosts:
    - ${host}
  http:
    - route:
        - destination:
            host: ${host}
${fault}
`;
}

/** Chaos Mesh CRD (PodChaos / NetworkChaos) for one target app. */
export function buildChaosMeshYaml(ctx: ProviderContext): string {
  const name = chaosMeshName(ctx.type, ctx.experimentId);
  const metadata = `  name: ${name}
  namespace: ${ctx.namespace}
  labels:
    app: ${ctx.target}
    chaos-lab: ops-service
    chaos-experiment: ${ctx.experimentId}`;
  const selector = `  mode: one
  selector:
    labelSelectors:
      app: ${ctx.target}
  duration: ${Math.round(ctx.durationSec)}s`;

  if (ctx.type === 'pod-failure') {
    return `apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
${metadata}
spec:
  action: podFailure
${selector}
`;
  }
  if (ctx.type === 'network-latency') {
    return `apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
${metadata}
spec:
  action: delay
${selector}
  delay:
    latency: ${Math.round(ctx.delayMs)}ms
    jitter: 100ms
`;
  }
  return `apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
${metadata}
spec:
  action: partition
${selector}
  direction: both
`;
}

/** Which Chaos Mesh kind an experiment type maps to. */
export function chaosMeshKind(type: ExperimentType): 'PodChaos' | 'NetworkChaos' {
  return type === 'pod-failure' ? 'PodChaos' : 'NetworkChaos';
}

/** Chaos Mesh resource name for stop/delete (must match the builder above). */
export function chaosMeshName(type: ExperimentType, experimentId: string): string {
  return `chaos-${type}-${resourceSuffix(experimentId)}`;
}

export function virtualServiceName(ctx: ProviderContext): string {
  return `chaos-fault-${ctx.target}-${resourceSuffix(ctx.experimentId)}`;
}

// ----------------------------------------------------------------- providers

/** Maps an experiment type to the shared fault-injection vocabulary. */
export function mapLocalFaultType(type: ExperimentType): 'latency' | 'pod-failure' {
  if (type === 'network-latency') return 'latency';
  return 'pod-failure';
}

/**
 * Local (no-cluster) provider: drives the target's own `/internal/fault`
 * endpoints. This is what makes the chaos demo work on a bare laptop.
 */
export function createLocalProvider(fetchFn: FetchLike): ChaosProvider {
  return {
    name: 'local',
    async start(ctx) {
      const url = `${ctx.targetBaseUrl}/internal/fault`;
      const body = JSON.stringify({
        type: mapLocalFaultType(ctx.type),
        durationSec: ctx.durationSec,
        delayMs: ctx.delayMs,
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      try {
        const response = await fetchFn(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'content-type': 'application/json', 'x-injected-by': 'ops-service' },
          body,
        });
        const text = await response.text();
        if (response.status === 404 && text.includes('FAULT_INJECTION_DISABLED')) {
          return {
            ok: false,
            faultDisabled: true,
            log: [`${ctx.target} responded 404 FAULT_INJECTION_DISABLED on POST /internal/fault`],
            error: `fault injection is disabled on ${ctx.target}`,
          };
        }
        if (!response.ok) {
          return {
            ok: false,
            log: [`${ctx.target} responded ${response.status} on POST /internal/fault`, text.slice(0, 500)],
            error: `unexpected ${response.status} from ${ctx.target}/internal/fault`,
          };
        }
        return {
          ok: true,
          log: [
            `POST ${url} → ${response.status}`,
            `injected '${mapLocalFaultType(ctx.type)}' fault on ${ctx.target} for ${ctx.durationSec}s (${ctx.delayMs}ms delay)`,
          ],
        };
      } catch (error) {
        const err = error as Error;
        return {
          ok: false,
          unreachable: true,
          log: [`POST ${url} failed: ${err?.name === 'AbortError' ? 'timeout after 3000ms' : (err?.message ?? 'unreachable')}`],
          error: err?.message ?? 'unreachable',
        };
      } finally {
        clearTimeout(timer);
      }
    },
    async stop(ctx) {
      const url = `${ctx.targetBaseUrl}/internal/fault`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      try {
        const response = await fetchFn(url, { method: 'DELETE', signal: controller.signal });
        const text = await response.text();
        return {
          ok: response.ok,
          log: [`DELETE ${url} → ${response.status}`, text.slice(0, 300)],
          ...(response.ok ? {} : { error: `unexpected ${response.status} from DELETE ${url}` }),
        };
      } catch (error) {
        const err = error as Error;
        return {
          ok: false,
          log: [`DELETE ${url} failed: ${err?.name === 'AbortError' ? 'timeout after 3000ms' : (err?.message ?? 'unreachable')}`],
          error: err?.message ?? 'unreachable',
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Istio provider: applies/deletes a fault-injecting VirtualService via kubectl. */
export function createIstioProvider(runner: KubectlRunner): ChaosProvider {
  return {
    name: 'istio',
    async start(ctx) {
      const result = await runner(['apply', '-f', '-'], { input: buildVirtualServiceYaml(ctx), timeoutMs: 15_000 });
      const ok = !result.timedOut && !result.missing && result.code === 0;
      return {
        ok,
        log: toLogLines(result, 'kubectl apply'),
        ...(ok ? {} : { error: result.missing ? 'kubectl binary not found' : (result.stderr.trim() || `kubectl exited ${result.code}`) }),
      };
    },
    async stop(ctx) {
      const result = await runner(
        ['delete', 'virtualservice', virtualServiceName(ctx), '-n', ctx.namespace, '--ignore-not-found'],
        { timeoutMs: 15_000 },
      );
      const ok = !result.timedOut && !result.missing && result.code === 0;
      return {
        ok,
        log: toLogLines(result, 'kubectl delete virtualservice'),
        ...(ok ? {} : { error: result.missing ? 'kubectl binary not found' : (result.stderr.trim() || `kubectl exited ${result.code}`) }),
      };
    },
  };
}

/** Chaos Mesh provider: applies/deletes PodChaos/NetworkChaos CRDs via kubectl. */
export function createChaosMeshProvider(runner: KubectlRunner): ChaosProvider {
  return {
    name: 'chaos-mesh',
    async start(ctx) {
      const result = await runner(['apply', '-f', '-'], { input: buildChaosMeshYaml(ctx), timeoutMs: 15_000 });
      const ok = !result.timedOut && !result.missing && result.code === 0;
      return {
        ok,
        log: toLogLines(result, 'kubectl apply'),
        ...(ok ? {} : { error: result.missing ? 'kubectl binary not found' : (result.stderr.trim() || `kubectl exited ${result.code}`) }),
      };
    },
    async stop(ctx) {
      const result = await runner(
        [
          'delete',
          chaosMeshKind(ctx.type).toLowerCase(),
          chaosMeshName(ctx.type, ctx.experimentId),
          '-n',
          ctx.namespace,
          '--ignore-not-found',
        ],
        { timeoutMs: 15_000 },
      );
      const ok = !result.timedOut && !result.missing && result.code === 0;
      return {
        ok,
        log: toLogLines(result, `kubectl delete ${chaosMeshKind(ctx.type).toLowerCase()}`),
        ...(ok ? {} : { error: result.missing ? 'kubectl binary not found' : (result.stderr.trim() || `kubectl exited ${result.code}`) }),
      };
    },
  };
}
