/**
 * Chaos safety guard — pure decision logic with an injectable kubectl
 * context getter so it can be unit-tested without a cluster.
 *
 * Order of checks:
 *   1. chaos must be explicitly enabled (CHAOS_ENABLED=true)
 *   2. the target must be one of the observed services
 *   3. in k8s mode the current kubectl context must exist and match the
 *      allow-list pattern (minikube/kind/desktop/… by default)
 */

export interface GuardConfig {
  chaosEnabled: boolean;
  chaosMode: 'local' | 'k8s';
  chaosAllowPattern: string;
  /** Names allowed as chaos targets (the observed services). */
  allowedTargets: string[];
}

export interface KubectlContext {
  available: boolean;
  context: string | null;
}

export type ContextGetter = () => Promise<KubectlContext>;

export type GuardOutcome =
  | { allowed: true; reason: string }
  | { allowed: false; status: number; code: string; message: string };

const DEFAULT_ALLOW_PATTERN = 'minikube|kind|desktop|docker-desktop|localhost';

const FORBIDDEN_MESSAGE =
  'Chaos experiments are disabled. Set CHAOS_ENABLED=true to enable them — chaos is restricted to local test environments (never production).';

/** Compiles the allow pattern; an invalid pattern falls back to the default. */
export function compileAllowPattern(pattern: string): RegExp {
  try {
    const compiled = new RegExp(pattern, 'i');
    // guard against patterns that can never match anything useful
    return compiled.test('') === false ? compiled : new RegExp(DEFAULT_ALLOW_PATTERN, 'i');
  } catch {
    return new RegExp(DEFAULT_ALLOW_PATTERN, 'i');
  }
}

/** Target-level guard used by POST /chaos. */
export async function checkChaosGuard(
  target: string,
  config: GuardConfig,
  getContext: ContextGetter,
): Promise<GuardOutcome> {
  const enabled = evaluateEnabled(config);
  if (!enabled.allowed) return enabled;

  const targetOutcome = evaluateTarget(target, config);
  if (!targetOutcome.allowed) return targetOutcome;

  if (config.chaosMode === 'k8s') {
    return evaluateClusterContext(config, await getContext());
  }

  return {
    allowed: true,
    reason: "local mode: chaos is injected through the target's /internal/fault endpoint",
  };
}

/** Aggregate guard used by GET /status (no specific target involved). */
export async function evaluateGuard(config: GuardConfig, getContext: ContextGetter): Promise<GuardOutcome> {
  const enabled = evaluateEnabled(config);
  if (!enabled.allowed) return enabled;
  if (config.chaosMode === 'k8s') return evaluateClusterContext(config, await getContext());
  return { allowed: true, reason: 'local mode: chaos is injected through the target service itself' };
}

function evaluateEnabled(config: GuardConfig): GuardOutcome {
  if (!config.chaosEnabled) {
    return { allowed: false, status: 403, code: 'CHAOS_FORBIDDEN', message: FORBIDDEN_MESSAGE };
  }
  return { allowed: true, reason: 'chaos enabled' };
}

function evaluateTarget(target: string, config: GuardConfig): GuardOutcome {
  if (!config.allowedTargets.includes(target)) {
    return {
      allowed: false,
      status: 400,
      code: 'CHAOS_TARGET_NOT_ALLOWED',
      message: `'${target}' is not an allowed chaos target. Allowed targets: ${config.allowedTargets.join(', ')}`,
    };
  }
  return { allowed: true, reason: 'target allowed' };
}

function evaluateClusterContext(config: GuardConfig, kubectl: KubectlContext): GuardOutcome {
  if (!kubectl.available) {
    return {
      allowed: false,
      status: 503,
      code: 'KUBECTL_UNAVAILABLE',
      message:
        'CHAOS_MODE=k8s requires kubectl, but the binary could not be executed. Install kubectl (or switch to CHAOS_MODE=local) and retry.',
    };
  }
  const context = kubectl.context?.trim();
  if (!context) {
    return {
      allowed: false,
      status: 503,
      code: 'KUBECTL_UNAVAILABLE',
      message:
        'kubectl has no current context (no cluster configured). Set one with `kubectl config use-context <name>` (e.g. minikube) or switch to CHAOS_MODE=local.',
    };
  }
  if (!compileAllowPattern(config.chaosAllowPattern).test(context)) {
    return {
      allowed: false,
      status: 403,
      code: 'CHAOS_CONTEXT_DENIED',
      message: `Refusing to run chaos experiments against kubectl context '${context}' — it does not match the allow-list pattern. Only local lab clusters (e.g. minikube, kind, docker-desktop) are permitted.`,
    };
  }
  return { allowed: true, reason: `cluster context '${context}' matches the chaos allow-list` };
}
