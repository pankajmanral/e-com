# Infrastructure guide — Service-Mesh Resilience Engineering Lab

The single reference for how the lab is wired: architecture, run modes,
resources, URLs, environment variables, setup and troubleshooting.
(Deploy step-by-step: `k8s/README.md` · demo script: `chaos/manual-demo.md`
· observability internals: `observability/README.md`.)

## 1. Architecture

```
                                ┌─────────────────────────── browser ───────────────────────────┐
                                │                http://localhost:3000 (storefront)             │
                                └───────────────────────────────┬───────────────────────────────┘
             Minikube/Istio mode: ingressgateway :80           │ compose/dev mode: direct
                                ┌───────────────────────────────┴───────────────────────────────┐
                                │                      frontend (Next.js 16)                    │
                                │        server-side API proxy (SERVICES_*_URL env vars)        │
                                └───┬─────────────────┬─────────────────┬───────────────┬───────┘
                                    │                 │                 │               │
             ┌──────────────────────▼──┐  ┌───────────▼──────────┐  ┌───▼────────────┐  │
             │ user-service    :4001   │  │ product-service:4002 │  │ order-service  │  │
             │ (profiles, identity)    │  │ (catalogue, CHAOS    │  │ :4003 (cart    │  │
             │                        │  │  TARGET)             │  │ checkout, JSON │  │
             └───────────┬─────────────┘  └───────────┬──────────┘  │ persistence)   │  │
                         │        order-service calls user+product  └───┬───────┬────┘  │
                         │                             ┌────────────────┘       │       │
             ┌───────────▼─────────────────────────────▼───────────────────────▼───────▼──┐
             │                       ops-service :4004 (control plane)                     │
             │   breaker states · resilience metrics proxy · chaos launcher (kubectl API)  │
             └───────────┬─────────────────────────────────────────────┬───────────────────┘
                         │ OTLP traces (all services via shared lib)   │ applies/deletes
                         │                                             │ Chaos Mesh CRs +
             ┌───────────▼────────────────────┐              ┌─────────▼──────────────────┐
             │ otel-collector :4317/:4318     │              │ Chaos Mesh (chaos-mesh ns) │
             │  memory_limiter→resource→batch │              │  PodChaos · NetworkChaos   │
             └───────┬────────────────┬───────┘              │  chaos-daemon (tc/netem)   │
                     │                │                      └─────────┬──────────────────┘
             OTLP/gRPC :4317      self-metrics :8889                    │ faults hit product pods
                     │                │                      ┌─────────▼──────────────────┐
             ┌───────▼───────┐  ┌─────▼──────────┐           │  Envoy sidecars (istiod    │
             │ Jaeger        │  │ Prometheus :9090│           │  injected in ecommerce ns)│
             │ all-in-one    │  │  scrapes /metrics│          │  retries · timeouts ·     │
             │ UI :16686     │  │  every 15s      │          │  circuit breaking ·       │
             └───────┬───────┘  └─────┬──────────┘          │  outlier detection        │
                     │                │                      └───────────────────────────┘
                     └───────┬────────┘
                     ┌───────▼────────┐
                     │ Grafana :3000  │  dashboards: "Resilience Lab — Service RED Metrics"
                     │ (host :3001)   │  + provisioned Prometheus & Jaeger datasources
                     └────────────────┘

Data flows:
  traces    service(Node SDK) → OTLP/HTTP → collector → OTLP/gRPC → Jaeger
  metrics   service /metrics (prom-client) → Prometheus scrape → Grafana panels
  faults    chaos-mesh controller → chaos-daemon(tc/kill on pod netns) → product pods
            ops-service → Kubernetes API → VirtualService fault patch (Istio layer)
```

Key point for the dissertation: **the mesh (Envoy sidecars) is the data-path
resilience layer** (retries, timeouts, connection pools, outlier detection —
`k8s/istio/`), while **ops-service + Chaos Mesh are the experiment layer**
(faults + breaker visibility). They are deliberately separate so faults and
defences can be toggled independently.

## 2. Three run modes

| Mode | Command | What you get |
|------|---------|--------------|
| **Lightweight dev** | `scripts/dev.ps1` (`./scripts/dev.sh`) | 5 processes on the host via `npm run dev`. No tracing (OTLP unset), no mesh, no chaos controllers. Fastest inner loop. |
| **Compose full stack** | `docker compose up -d --build` | All 5 apps containerised + collector + Jaeger + Prometheus + Grafana. Real traces/metrics, no service mesh, chaos limited to the per-service `/internal/fault` endpoints. |
| **Minikube + Istio lab** | `scripts/k8s-build-load.ps1 && scripts/k8s-deploy.ps1` | Everything, plus: Envoy sidecars (retries/timeouts/circuit breaking), Istio fault injection, Chaos Mesh experiments, PDBs, RBAC. **This is the mode the dissertation evaluates.** |

## 3. Resource requirements

| Mode | CPU | RAM | Disk |
|------|-----|-----|------|
| Lightweight dev | 2 cores | 2 GB | < 1 GB |
| Docker Compose | 4 cores | 8 GB | ~5 GB (images + volumes) |
| Minikube lab | 4 cores free for the VM (`--cpus 4`) | 8-10 GB (`--memory 8192`) | ~15 GB (5 app images + Istio + Chaos Mesh + observability) |

Notes:
* Minikube runs with `--driver docker`, so its memory is carved out of
  Docker Desktop — raise Docker Desktop's own VM resources to match.
* Grafana + Prometheus are scraped/refreshed every 10-15s; on an idle
  laptop the TSDB retention is capped (`--storage.tsdb.retention.time=6h`,
  Prometheus emptyDir 512Mi) so restarts never bloat the node.

## 4. Ports and URLs

| Component | Container port | Host port (compose) | Host port (k8s via port-forward) |
|-----------|---------------:|--------------------:|---------------------------------:|
| frontend (Next.js) | 3000 | 3000 | 3000 |
| user-service | 4001 | 4001 | — (cluster only) |
| product-service | 4002 | 4002 | — |
| order-service | 4003 | 4003 | — |
| ops-service | 4004 | 4004 | 4004 |
| Jaeger UI | 16686 | 16686 | 16686 |
| Jaeger OTLP gRPC / HTTP | 4317 / 4318 | — | — |
| OTel collector OTLP gRPC / HTTP | 4317 / 4318 | 4317 / 4318 | — |
| OTel collector self-metrics | 8889 | 8889 | — |
| Prometheus | 9090 | 9090 | 9090 |
| Grafana | 3000 | **3001** | **3001** |
| Istio ingressgateway | 80 | `minikube ip`:80 | 8080 |
| Chaos Mesh dashboard | 2333 | — | 2333 (opt-in) |

Grafana is on host 3001 in both stack modes so it never collides with the
storefront on 3000.

## 5. Environment variables

Set by `k8s/configmap.yaml` (cluster) and `docker-compose.yml` (compose);
`.env.example` documents the dev-mode equivalents.

| Variable | Purpose | Example (in-cluster) |
|----------|---------|----------------------|
| `PORT` | HTTP listen port | `4001` |
| `NODE_ENV` | runtime mode | `production` |
| `DEPLOYMENT_ENV` | `deployment.environment.name` trace attribute | `k8s` / `compose` |
| `LOG_LEVEL` | pino level | `info` |
| `CORS_ORIGIN` | allowed browser origin | `http://localhost:3000` |
| `USER_SERVICE_URL` | user-service base (used by order-service) | `http://user-service:4001` |
| `PRODUCT_SERVICE_URL` | product-service base (order-service) | `http://product-service:4002` |
| `ORDER_SERVICE_URL` | order-service base | `http://order-service:4003` |
| `OPS_SERVICE_URL` | ops-service base | `http://ops-service:4004` |
| `SERVICES_USER_URL` | Next.js proxy target → user | `http://user-service:4001` |
| `SERVICES_PRODUCT_URL` | Next.js proxy → product | `http://product-service:4002` |
| `SERVICES_ORDER_URL` | Next.js proxy → order | `http://order-service:4003` |
| `SERVICES_OPS_URL` | Next.js proxy → ops | `http://ops-service:4004` |
| `SERVICES` | ops-service target list (`svc:port,...`) | `user-service:4001,product-service:4002,order-service:4003` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | collector base URL (SDK appends `/v1/traces`) | `http://otel-collector.observability.svc.cluster.local:4318` |
| `OTEL_TRACES_EXPORTER` | `otlp` enables export; `none` disables | `otlp` |
| `PROMETHEUS_URL` | Prometheus for ops-service + Grafana datasource | `http://prometheus.observability.svc.cluster.local:9090` |
| `JAEGER_URL` | Jaeger base (Grafana datasource + web links) | `http://jaeger:16686` / `http://localhost:16686` |
| `FAULT_INJECTION_ENABLED` | per-service `/internal/fault` endpoints (local mode) | `false` |
| `CHAOS_ENABLED` | master switch for the ops-service chaos launcher | `true` (k8s) / `false` (compose) |
| `CHAOS_MODE` | `local` (in-process faults) \| `k8s` (Chaos Mesh/Istio via API) | `k8s` |
| `CHAOS_ALLOW_PATTERN` | kubectl contexts allowed to receive chaos | `minikube\|kind\|desktop\|docker-desktop\|localhost` |
| `CHAOS_NAMESPACE` | namespace every experiment is scoped to | `ecommerce` |
| `PRODUCT_VERSION` | canary behaviour switch (v2 twin only) | `v2` |
| `GF_SECURITY_ADMIN_PASSWORD` / `GRAFANA_ADMIN_PASSWORD` | Grafana admin override | lab default `admin` |

## 6. Manual setup steps

Fast path (Windows): `scripts/setup-windows.ps1 -Install`, then either
`scripts/dev.ps1` (mode 1) or the Minikube path below (mode 3).

```powershell
# 1. cluster
minikube start --cpus 4 --memory 8192 --driver docker
minikube addons enable metrics-server
istioctl install -y --set profile=demo

# 2. platform
helm repo add chaos-mesh https://chaos-mesh.github.io/chaos-mesh
helm install chaos-mesh chaos-mesh/chaos-mesh -n chaos-mesh --create-namespace `
  --set chaosDaemon.runtime=containerd --set chaosDaemon.socketPath=/run/containerd/containerd.sock `
  --set dashboards.create=true --set prometheus.create=false
kubectl apply -f k8s/namespace.yaml -f k8s/observability/namespace.yaml -f k8s/configmap.yaml

# 3. observability
kubectl apply -f k8s/observability/otel-collector.yaml -f k8s/observability/jaeger.yaml `
               -f k8s/observability/prometheus.yaml -f k8s/observability/grafana-dashboard.yaml `
               -f k8s/observability/grafana.yaml

# 4. apps (build once per code change)
scripts/k8s-build-load.ps1
scripts/k8s-deploy.ps1

# 5. demo plumbing
scripts/port-forward.ps1        # keep running; Ctrl+C ends it
scripts/chaos-start.ps1 -Type pod-failure -Duration 60s
```

Compose path: `docker compose up -d --build` → all UIs per the table in §4.

## 7. Component ownership (who runs where, who scrapes whom)

| Component | Runs in | Owned by manifest | Reads from | Written/scraped by |
|-----------|---------|-------------------|------------|--------------------|
| user/product/order-service | compose net / ecommerce ns | `k8s/<svc>.yaml` | shared lib, env | frontend proxy, order→user/product calls; scraped by Prometheus (`/metrics`) |
| ops-service | compose net / ecommerce ns | `k8s/ops-service.yaml` | Prometheus API, Kubernetes API | frontend `/api/ops` proxy; has Role for VirtualServices + chaos CRs |
| frontend | compose net / ecommerce ns | `k8s/frontend.yaml` | all four services via env URLs | browser; exposed by Istio Gateway |
| otel-collector | compose net / observability ns | `k8s/observability/otel-collector.yaml` | OTLP :4317/:4318 from services | forwards to Jaeger; exposes :8889 for Prometheus |
| jaeger | compose net / observability ns | `k8s/observability/jaeger.yaml` | OTLP from collector | UI :16686; queried by Grafana datasource |
| prometheus | compose net / observability ns | `k8s/observability/prometheus.yaml` | scrapes services + collector + itself | queried by Grafana + ops-service |
| grafana | compose net / observability ns | `k8s/observability/grafana.yaml` | Prometheus + Jaeger datasources | humans/dashboards |
| istiod + ingressgateway | istio-system ns | `istioctl install` | Istio CRs in ecommerce ns | sidecar config injection |
| chaos-controller/daemon | chaos-mesh ns | helm chart | Chaos Mesh CRs in ecommerce ns | kills/delays product pods via tc/kill |

## 8. Known trade-offs (dissertation limitations)

* **order-service persistence** is an emptyDir (`k8s/volumes.yaml` documents
  the PVC upgrade path): orders are per-pod and lost on reschedule — by
  design, the mesh/chaos behaviour is what's under study, not storage.
* **Static Prometheus targets** instead of the Prometheus Operator — chosen
  for auditability; `observability/prometheus/prometheus.k8s.yml` explains.
* **Jaeger all-in-one with in-memory storage** — traces age out with the
  pod; fine for a lab, wrong for production forensics.
* **`--declaration` workaround**: the service Dockerfiles build
  `@ecommerce/shared` with `tsc -- --declaration` because
  `tsconfig.base.json` sets `declaration: false` while the package advertises
  `dist/index.d.ts` types. Once `packages/shared/tsconfig.json` gains
  `"declaration": true`, drop the flag from the five Dockerfiles and
  `scripts/dev.*`.
* **Grafana dashboard ConfigMap is generated** (`k8s/observability/
  grafana-dashboard.yaml`) from the JSON source — edit the JSON, re-run
  `node scripts/gen-dashboard-configmap.mjs`, re-apply.

## 9. Troubleshooting

| Symptom | Likely cause → fix |
|---------|--------------------|
| Pods `1/2`, istio-proxy `Error` | Injection raced the app or istiod wasn't ready: `kubectl -n ecommerce rollout restart deploy`, then check `kubectl -n ecommerce logs <pod> -c istio-proxy`. |
| No sidecar at all | Namespace label missing: `kubectl label ns ecommerce istio-injection=enabled` (already in `k8s/namespace.yaml`), restart deployments. |
| `ImagePullBackOff` for `ecommerce/*` | Image never loaded into Minikube: `scripts/k8s-build-load.ps1` (or `minikube image load ecommerce/user-service:1.0.0`). Verify: `minikube image ls`. |
| `Cannot find module '@ecommerce/shared'` at runtime | Stale image built from a broken cache: `docker build --no-cache -f <svc>/Dockerfile -t <img> .` then reload. |
| Services log `ECONNREFUSED` to OTLP | Collector name/namespace wrong or pod not Ready. URL must be `http://otel-collector.observability.svc.cluster.local:4318` (`k8s/configmap.yaml`). Spans drop; traffic is unaffected. |
| Prometheus target down | Pod not Ready / wrong port; inspect Status → Targets after port-forwarding Prometheus. |
| Gateway 503 on `/` | frontend has no Ready endpoints: `kubectl -n ecommerce get endpoints frontend`; check the edge VirtualService. |
| Chaos apply fails: `no matches for kind` | Chaos Mesh CRDs missing — re-run the helm install; `kubectl get crd \| findstr chaos`. |
| `chaos-start` refuses to run | Context guard tripped — you are not on a local-cluster context, or pass `-Force` knowingly. |
| Grafana dashboard missing | ConfigMap not applied or stale: `node scripts/gen-dashboard-configmap.mjs && kubectl apply -f k8s/observability/grafana-dashboard.yaml`, restart grafana. |
| Port already in use (3001/9090/16686) | A compose stack is still up alongside k8s: `docker compose down`, or stop the port-forward. |

## 10. Repository map (infra scope)

```
Dockerfiles            services/{user,product,order,ops}-service/Dockerfile, apps/web/Dockerfile
docker-compose.yml     full stack on plain Docker
observability/         otel-collector config, prometheus configs + rules, grafana provisioning + dashboard
k8s/                   namespace, configmap, secrets example, per-service manifests, volumes,
                       istio/ (gateway, destination rules, virtual services, fault-injection templates),
                       observability/ (collector, jaeger, prometheus, grafana + generated dashboard),
                       chaos/ (pointer stubs → ../chaos/experiments)
chaos/                 canonical Chaos Mesh experiments, README, manual demo script
scripts/               dev, setup-windows, k8s-build-load, k8s-deploy, k8s-teardown,
                       port-forward, chaos-start/stop (each .ps1 + .sh)
docs/INFRA.md          this file
```
