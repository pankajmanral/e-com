/**
 * Configuration for the ops-service. Everything is read from the environment
 * with lab-friendly defaults so `npm run dev` works on a bare laptop with no
 * Kubernetes cluster, no Prometheus and no Jaeger.
 */

export interface ServiceTarget {
  /** Logical service name, e.g. `product-service`. */
  name: string;
  port: number;
  /** Resolved base URL (env override → in-cluster DNS → localhost). */
  baseUrl: string;
}

export interface OpsConfig {
  port: number;
  version: string;
  services: ServiceTarget[];
  prometheusUrl: string;
  jaegerUrl: string | null;
  metricsPollIntervalMs: number;
  metricsHistoryPoints: number;
  chaosEnabled: boolean;
  chaosMode: 'local' | 'k8s';
  /** Provider used when a request says provider='auto' while in k8s mode. */
  chaosDefaultProvider: 'istio' | 'chaos-mesh';
  chaosAllowPattern: string;
  chaosNamespace: string;
  kubectlBin: string;
  faultInjectionEnabled: boolean;
}

export type EnvLike = Record<string, string | undefined>;

function num(value: string | undefined, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function bool(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

/**
 * Environment variable that can override a service's base URL.
 * `product-service` → `PRODUCT_SERVICE_URL` (the `-service` suffix is implied
 * by the variable); a custom name like `api-gateway` → `API_GATEWAY_SERVICE_URL`.
 */
export function serviceUrlEnvVar(name: string): string {
  const stem = name.replace(/-service$/i, '').replace(/-/g, '_').toUpperCase();
  return `${stem}_SERVICE_URL`;
}

/** Resolves the base URL for one service entry. */
export function resolveServiceBaseUrl(name: string, port: number, env: EnvLike): string {
  const explicit = env[serviceUrlEnvVar(name)]?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  // Also accept the fully spelled out variant (e.g. PRODUCT_SERVICE_SERVICE_URL).
  const full = `${name.replace(/-/g, '_').toUpperCase()}_SERVICE_URL`;
  const explicitFull = env[full]?.trim();
  if (explicitFull) return explicitFull.replace(/\/$/, '');
  // Inside Kubernetes the cluster DNS name is `<service>.<namespace>.svc…`;
  // plain `<name>` already resolves through kube-dns for same-namespace pods.
  if (env.KUBERNETES_SERVICE_HOST) return `http://${name}:${port}`;
  return `http://127.0.0.1:${port}`;
}

const DEFAULT_SERVICES = 'user-service:4001,product-service:4002,order-service:4003';

/** Parses the `SERVICES` comma list into targets (invalid entries are skipped). */
export function parseServiceTargets(value: string | undefined, env: EnvLike): ServiceTarget[] {
  const raw = value?.trim() || DEFAULT_SERVICES;
  const targets: ServiceTarget[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [name, portRaw] = trimmed.split(':');
    const nameTrimmed = name?.trim();
    if (!nameTrimmed) continue;
    const port = num(portRaw?.trim(), 80, 1, 65535);
    if (targets.some((t) => t.name === nameTrimmed)) continue;
    targets.push({ name: nameTrimmed, port, baseUrl: resolveServiceBaseUrl(nameTrimmed, port, env) });
  }
  return targets;
}

/** Reads the whole configuration. `env` is injectable for tests. */
export function loadConfig(env: EnvLike = process.env): OpsConfig {
  const mode = env.CHAOS_MODE?.trim().toLowerCase() === 'k8s' ? 'k8s' : 'local';
  const defaultProvider = env.CHAOS_DEFAULT_PROVIDER?.trim().toLowerCase();
  return {
    port: num(env.PORT, 4004, 1, 65535),
    version: env.SERVICE_VERSION?.trim() || '1.0.0',
    services: parseServiceTargets(env.SERVICES, env),
    prometheusUrl: (env.PROMETHEUS_URL?.trim() || 'http://localhost:9090').replace(/\/$/, ''),
    jaegerUrl: env.JAEGER_URL?.trim() || null,
    metricsPollIntervalMs: num(env.METRICS_POLL_INTERVAL_MS, 5_000, 250, 300_000),
    metricsHistoryPoints: num(env.METRICS_HISTORY_POINTS, 1_800, 10, 100_000),
    chaosEnabled: bool(env.CHAOS_ENABLED),
    chaosMode: mode,
    chaosDefaultProvider: defaultProvider === 'chaos-mesh' ? 'chaos-mesh' : 'istio',
    chaosAllowPattern: env.CHAOS_ALLOW_PATTERN?.trim() || 'minikube|kind|desktop|docker-desktop|localhost',
    chaosNamespace: env.CHAOS_NAMESPACE?.trim() || 'ecommerce',
    kubectlBin: env.KUBECTL_BIN?.trim() || 'kubectl',
    faultInjectionEnabled: bool(env.FAULT_INJECTION_ENABLED),
  };
}
