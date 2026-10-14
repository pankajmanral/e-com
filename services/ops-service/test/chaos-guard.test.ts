import { describe, expect, it } from 'vitest';
import { checkChaosGuard, compileAllowPattern, evaluateGuard, type ContextGetter, type GuardConfig } from '../src/chaos/guard';

const TARGETS = ['user-service', 'product-service', 'order-service'];

function config(overrides: Partial<GuardConfig> = {}): GuardConfig {
  return {
    chaosEnabled: true,
    chaosMode: 'local',
    chaosAllowPattern: 'minikube|kind|desktop|docker-desktop|localhost',
    allowedTargets: TARGETS,
    ...overrides,
  };
}

const contextOf = (context: string, available = true): ContextGetter => async () => ({ available, context });

const NEVER: ContextGetter = async () => {
  throw new Error('context getter must not be called');
};

describe('checkChaosGuard', () => {
  it('rejects with 403 CHAOS_FORBIDDEN when chaos is disabled', async () => {
    const outcome = await checkChaosGuard('product-service', config({ chaosEnabled: false }), NEVER);
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) return;
    expect(outcome.status).toBe(403);
    expect(outcome.code).toBe('CHAOS_FORBIDDEN');
    expect(outcome.message).toContain('CHAOS_ENABLED=true');
    expect(outcome.message).toContain('local test environments');
  });

  it('rejects targets outside the allow-list with 400', async () => {
    const outcome = await checkChaosGuard('payment-service', config(), NEVER);
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) return;
    expect(outcome.status).toBe(400);
    expect(outcome.code).toBe('CHAOS_TARGET_NOT_ALLOWED');
    expect(outcome.message).toContain('payment-service');
    expect(outcome.message).toContain('product-service');
  });

  it('allows every configured service in local mode without kubectl', async () => {
    for (const target of TARGETS) {
      const outcome = await checkChaosGuard(target, config(), NEVER);
      expect(outcome.allowed).toBe(true);
    }
  });

  it('allows a k8s context that matches the allow pattern', async () => {
    const outcome = await checkChaosGuard('order-service', config({ chaosMode: 'k8s' }), contextOf('minikube'));
    expect(outcome.allowed).toBe(true);
  });

  it('matches the pattern case-insensitively and against custom clusters', async () => {
    const getter = contextOf('kind-kind-cluster');
    const outcome = await checkChaosGuard('user-service', config({ chaosMode: 'k8s', chaosAllowPattern: 'kind|mini' }), getter);
    expect(outcome.allowed).toBe(true);
  });

  it('denies production contexts with 403 and names the context', async () => {
    const outcome = await checkChaosGuard('product-service', config({ chaosMode: 'k8s' }), contextOf('prod-eu-1'));
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) return;
    expect(outcome.status).toBe(403);
    expect(outcome.code).toBe('CHAOS_CONTEXT_DENIED');
    expect(outcome.message).toContain('prod-eu-1');
  });

  it('returns 503 KUBECTL_UNAVAILABLE when kubectl is missing', async () => {
    const outcome = await checkChaosGuard('product-service', config({ chaosMode: 'k8s' }), contextOf(null, false));
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) return;
    expect(outcome.status).toBe(503);
    expect(outcome.code).toBe('KUBECTL_UNAVAILABLE');
  });

  it('returns 503 when kubectl has no current context', async () => {
    const outcome = await checkChaosGuard('product-service', config({ chaosMode: 'k8s' }), contextOf(null, true));
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) return;
    expect(outcome.status).toBe(503);
    expect(outcome.code).toBe('KUBECTL_UNAVAILABLE');
  });

  it('checks the enable flag before the target', async () => {
    const outcome = await checkChaosGuard('nope-service', config({ chaosEnabled: false }), NEVER);
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) return;
    expect(outcome.code).toBe('CHAOS_FORBIDDEN');
  });
});

describe('evaluateGuard (status endpoint view)', () => {
  it('reports the disabled reason without touching kubectl', async () => {
    const outcome = await evaluateGuard(config({ chaosEnabled: false }), NEVER);
    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) return;
    expect(outcome.code).toBe('CHAOS_FORBIDDEN');
  });

  it('allows in local mode', async () => {
    const outcome = await evaluateGuard(config(), NEVER);
    expect(outcome.allowed).toBe(true);
  });

  it('verifies the cluster context in k8s mode', async () => {
    const denied = await evaluateGuard(config({ chaosMode: 'k8s' }), contextOf('gke_sandbox_eu'));
    expect(denied.allowed).toBe(false);
    const allowed = await evaluateGuard(config({ chaosMode: 'k8s' }), contextOf('docker-desktop'));
    expect(allowed.allowed).toBe(true);
  });
});

describe('compileAllowPattern', () => {
  it('falls back to a safe default for an invalid pattern', () => {
    expect(compileAllowPattern('(').test('minikube')).toBe(true);
    expect(compileAllowPattern('(').test('prod')).toBe(false);
  });

  it('rejects patterns that would match everything (including empty context)', () => {
    const pattern = compileAllowPattern('.*');
    expect(pattern.test('prod-eu')).toBe(false);
  });
});
