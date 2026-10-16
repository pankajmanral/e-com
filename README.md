# Vantage Supply Co. — Service-Mesh Resilience Engineering Lab

A production-style e-commerce web application built as the experimental subject of an MSc IT
final-year project titled **"Service-Mesh Resilience Engineering Lab with OpenTelemetry and
Chaos Experiments."**

The storefront itself is deliberately ordinary — the point of the project is everything around it:
four independently deployable microservices, an Istio service mesh, full-stack observability
(OpenTelemetry → Jaeger, Prometheus → Grafana) and controlled chaos experiments that prove how the
system degrades and recovers. A dedicated **admin dashboard** triggers those experiments and
compares resilience metrics *before* and *after* each failure.

---

## Table of contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Three ways to run it](#three-ways-to-run-it)
- [Local development (lightweight mode)](#local-development-lightweight-mode)
- [Full stack with Docker Compose](#full-stack-with-docker-compose)
- [Full lab on Minikube + Istio](#full-lab-on-minikube--istio)
- [Observability](#observability)
- [Chaos engineering](#chaos-engineering)
- [Admin dashboard](#admin-dashboard)
- [API reference](#api-reference)
- [Testing](#testing)
- [Windows-specific notes](#windows-specific-notes)
- [Prerequisites and resource requirements](#prerequisites-and-resource-requirements)
- [Dissertation demo script](#dissertation-demo-script)

---

## Architecture

```
                        ┌──────────────────────────────────────────────────────────────┐
                        │                     Browser / Admin UI                       │
                        └────────────────────────────┬─────────────────────────────────┘
                                                     │  Next.js 16 (App Router, TS, Tailwind v4)
                                                     │  BFF route handlers /api/*
                 ┌───────────────────────────────────┴───────────────────────────────────┐
                 │ Istio IngressGateway (k8s mode)  ──or──  direct localhost ports       │
   ┌─────────────┴───────────┬─────────────────────┬─────────────────────┬───────────────┴──┐
   │                         │                     │                     │                  │
┌──▼───────────┐      ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
│ user-service │      │ product-svc │       │ order-svc   │       │ ops-service │
│    :4001     │      │    :4002    │       │    :4003    │       │    :4004    │
│  customers   │      │  catalogue  │       │  checkout   │       │ chaos+meta  │
└──────▲───────┘      └──────▲──────┘       └──┬───┬───┬──┘       └──┬──────┬───┘
       │  resolve/validate   │ deduct/restore  │   │   │             │      │
       └─────────────────────┴─────────────────┘   │   └─────────────┘      │
                     inter-service calls           │                        │
                     (ServiceClient: timeout,      │                        │
                      retry, circuit breaker,      │                        │
                      traceparent propagation)     │                        │
                                                   ▼                        ▼
                                     POST /internal/fault          kubectl (k8s mode)
                                     (local chaos mode)            Chaos Mesh / Istio faults

Observability side-car of every service:
  OTLP traces  → otel-collector → Jaeger UI :16686
  /metrics     → Prometheus :9090 → Grafana :3001  (ops-service can also scrape directly)
```

**Business flow of a checkout** (all real HTTP calls, all traced):

1. `order-service` resolves/creates the customer via `user-service` (`POST /api/users/resolve`).
2. It fetches live prices and stock from `product-service`.
3. It computes totals in INR (8 % tax, free shipping over ₹11,000), charges a mock card gateway
   (test card `4242 4242 4242 4242` approves, `4000 0000 0000 0002` declines).
   Demo prices use a fixed project rate of ₹110 per pound sterling; this is not a live exchange
   rate.
4. It reserves stock (`POST /api/products/stock/deduct` — atomic per item, with a compensating
   restore if anything fails afterwards).
5. It persists the order to the datastore (**MongoDB** when configured, a JSON file otherwise)
   and returns it **with its OpenTelemetry `traceId`**, which the
   confirmation page links straight into Jaeger.

## Data layer (MongoDB)

Every service owns its data. **MongoDB 7 is the primary datastore**; each service connects to it
at boot with the official `mongodb` driver and uses its own database:

| Service | Database | Collections | Key indexes |
|---------|----------|-------------|-------------|
| user-service | `vantage_user_service` | `users`, `counters` | unique `email` |
| product-service | `vantage_product_service` | `products`, `counters` | unique `slug`, `category`, `price` |
| order-service | `vantage_order_service` | `orders`, `counters` | `createdAt`, `userId`, `customer.email` |
| ops-service | `vantage_ops_service` | `snapshots`, `experiments`, `counters` | `createdAt`, `status+startedAt` |

Design points:

- **Graceful fallback** — if `MONGODB_URI` is unset *or* unreachable, a service logs a warning and
  falls back to its seeded in-memory / JSON-file store, so the dependency-free `npm run dev` mode
  keeps working. Set `MONGODB_REQUIRED=true` (Docker Compose and Kubernetes do) to fail fast
  instead. The active mode is visible on every `/health` as `datastore: "mongodb" | "memory"` and
  on the admin dashboard status strip.
- **Idempotent seeding** — seed data (8 customers, 24 products, 3 sample orders) is inserted only
  when a collection is empty; a `counters` sequence document keeps generated ids
  (`usr-1042`, `ord-…`) monotonic above the seeded range.
- **Atomic stock reservation** — product stock is decremented with a guarded
  `findOneAndUpdate({stock: {$gte: qty}}, {$inc: {stock: -qty}})` per item; multi-item orders
  roll back already-decremented items on failure (the same compensating pattern the mesh demo
  exercises).
- **Telemetry is not stored in Mongo** — raw metric samples stay in Prometheus (or the ops
  service's ring buffer); only snapshots and chaos-experiment records are persisted.

Run with MongoDB locally:

```powershell
docker run -d --name vantage-mongo -p 27017:27017 mongo:7
$env:MONGODB_URI='mongodb://localhost:27017'; $env:MONGODB_REQUIRED='true'
npm run dev
```

Reset the data: `docker exec vantage-mongo mongosh --quiet --eval 'db.getSiblingDB("vantage_user_service").dropDatabase()'`
(or simply drop each `vantage_*` database).

## Tech stack

| Layer      | Choice |
|------------|--------|
| Frontend   | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Recharts |
| Backend    | Node.js 20+, Express 5, TypeScript (CommonJS), Zod 4 validation |
| Datastore  | MongoDB 7 (official driver, per-service databases) with in-memory / JSON-file fallback |
| Shared lib | `@ecommerce/shared` — app factory, logging (pino), metrics (prom-client), OTel bootstrap, circuit breaker, retries, typed service client |
| Containers | Docker (multi-stage, distroless-style `node:24-alpine`, non-root) |
| Orchestration | Kubernetes (Minikube) + Istio (Gateway, VirtualService, DestinationRule) |
| Tracing    | OpenTelemetry SDK → OTLP → collector → Jaeger |
| Metrics    | Prometheus (RED metrics) → Grafana dashboards + alert rules |
| Chaos      | Chaos Mesh (PodChaos, NetworkChaos) + Istio fault injection + in-process fault injection for the cluster-free lab mode |

## Repository layout

```
.
├── apps/web                  # Next.js storefront + admin dashboard (:3000)
├── packages/shared           # @ecommerce/shared runtime library used by every service
├── services/
│   ├── user-service          # customers, checkout identity        (:4001)
│   ├── product-service       # catalogue, stock reservation        (:4002)
│   ├── order-service         # checkout orchestration + payments   (:4003)
│   └── ops-service           # health, metrics, snapshots, chaos    (:4004)
├── observability/            # OTel collector, Prometheus, Grafana provisioning + dashboards
├── k8s/                      # namespace, deployments, Istio, observability, chaos manifests
├── chaos/                    # canonical chaos experiment YAMLs + manual demo script
├── scripts/                  # dev / setup / k8s deploy / port-forward / chaos helpers
├── docs/                     # infra guide, Windows setup, demonstration script
├── docker-compose.yml        # full stack on plain Docker
└── .env.example              # every environment variable, documented
```

## Three ways to run it

| Mode | Command | Needs | What you get |
|------|---------|-------|--------------|
| **1. Lightweight dev** | `npm install` then `npm run dev` | Node 20+ only | All 4 services + storefront on localhost, in-process fault injection for chaos, metrics scraped by ops-service directly |
| **2. Docker Compose** | `docker compose up -d --build` | Docker | Everything above **plus** OTel collector, Jaeger, Prometheus, Grafana |
| **3. Full mesh lab** | `scripts/k8s-deploy.ps1` | Minikube + Istio + Chaos Mesh | Everything above **inside Kubernetes** with Istio sidecars, traffic management, retries, timeouts, circuit breaking, real pod failures |

Chaos controls are **disabled unless explicitly enabled** and can only target environments whose
kubectl context matches `minikube|kind|desktop|docker-desktop|localhost` — see
[Chaos engineering](#chaos-engineering).

## Local development (lightweight mode)

```powershell
# Windows (PowerShell)
npm install
npm run dev
```

```bash
# macOS / Linux
npm install
npm run dev
```

This builds `@ecommerce/shared` and starts five processes with `concurrently`:

| Process | URL |
|---------|-----|
| Storefront + BFF | http://localhost:3000 |
| user-service | http://localhost:4001/health |
| product-service | http://localhost:4002/health |
| order-service | http://localhost:4003/health |
| ops-service | http://localhost:4004/api/ops/health |

Then open http://localhost:3000, add products to the cart, check out with test card
`4242 4242 4242 4242`, and open the **Admin** page to run chaos experiments — in this mode the
ops-service injects faults directly into the target service (`POST /internal/fault`), so latency
spikes and 503 storms are real even without a cluster.

Run the automated smoke test while everything is up:

```powershell
npm run smoke          # full flow incl. a live chaos experiment
node scripts/smoke-test.mjs --skip-chaos
```

## Full stack with Docker Compose

```powershell
docker compose up -d --build
```

| Component | URL |
|-----------|-----|
| Storefront | http://localhost:3000 |
| Jaeger UI | http://localhost:16686 |
| Prometheus | http://localhost:9090 |
| Grafana (anonymous admin) | http://localhost:3001 |

Compose wires the services to export OTLP traces to the collector, which forwards them to Jaeger;
Prometheus scrapes each service's `/metrics` and loads the recording/alert rules from
`observability/prometheus/rules.yaml`; Grafana is provisioned with the datasources and the
**Resilience Lab — Service RED Metrics** dashboard automatically.

## Full lab on Minikube + Istio

```powershell
# 1. one-time prerequisites (checks/installs node, docker, kubectl, minikube, istioctl, helm)
scripts/setup-windows.ps1

# 2. start a sized-for-the-lab cluster and install the mesh
minikube start --cpus=4 --memory=8192 --driver=docker
istioctl install -y

# 3. build + load images, deploy everything, wire Istio
scripts/k8s-build-load.ps1
scripts/k8s-deploy.ps1

# 4. open the lab (port-forwards match the local URLs)
scripts/port-forward.ps1
```

In this mode:

- every pod carries an Istio sidecar — service discovery, load balancing, retries
  (`attempts: 3`, `perTryTimeout: 1s`), `timeout: 3s` and circuit breaking
  (`outlierDetection consecutive5xxErrors: 5`, connection pool limits) are configured per service in
  `k8s/istio/`;
- `ops-service` runs with `CHAOS_MODE=k8s` and applies **real** Chaos Mesh CRDs
  (`PodChaos`, `NetworkChaos`) or Istio fault injections through `kubectl`;
- the chaos guard refuses to run unless `CHAOS_ENABLED=true` **and** the current kubectl context
  matches the allowed local-cluster pattern.

Step-by-step detail, cleanup and troubleshooting: [`docs/INFRA.md`](docs/INFRA.md).

## Observability

**Traces** — every service initialises the OpenTelemetry NodeSDK in `src/instrumentation.ts`
*before* express or fetch are loaded, so HTTP servers, clients and express routers are
auto-instrumented. Spans are exported over OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT`) with
`service.name`/`service.version` resource attributes, and W3C `traceparent` headers are propagated
across inter-service calls (manually as well as by instrumentation). Orders carry their `traceId`
so the storefront confirmation page can deep-link into Jaeger.

**Metrics** — each service exposes Prometheus metrics on `/metrics` (`http_requests_total`,
`http_request_duration_seconds`, process metrics). Prometheus scrapes them, records RED dashboards
and alert rules; the ops-service can also scrape directly (used in the cluster-free mode) and
always reports which source answered (`source: "prometheus" | "scrape"`).

**Logs** — structured pino JSON with `service` and `requestId` on every line; the request id is
propagated from the gateway through all inter-service calls (`x-request-id`) so a single request can
be joined across logs, metrics and traces.

Useful PromQL (also used in the dashboards):

```promql
sum by (service) (rate(http_requests_total[2m]))
sum by (service) (rate(http_requests_total{status=~"5.."}[2m]))
  / sum by (service) (rate(http_requests_total[2m]))
histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))
```

## Chaos engineering

Three supported experiments, each available in up to three providers:

| Experiment | Local mode (no cluster) | Kubernetes mode |
|------------|-------------------------|-----------------|
| `pod-failure` | target answers 503 for the duration (approximation of a killed replica) | Chaos Mesh `PodChaos` (`action: podFailure`) |
| `network-latency` | every request delayed by `delayMs` | Chaos Mesh `NetworkChaos` (`action: delay`) or Istio fault injection |
| `service-outage` | target answers 503 for the duration | Chaos Mesh `NetworkChaos` (`action: partition`) or Istio `abort` faults |

**Safety rails** (implemented in `ops-service`):

1. `CHAOS_ENABLED` must be explicitly `true` (default `false` everywhere, including the images).
2. In `k8s` mode the current kubectl context must match `CHAOS_ALLOW_PATTERN`
   (default `minikube|kind|desktop|docker-desktop|localhost`) — remote clusters are refused.
3. Only the three business services are valid targets; the frontend and the ops-service are not.
4. Every experiment is bounded (`durationSec`, max 600 s), auto-captures a **before** snapshot,
   captures an **after** snapshot when it ends, and can be stopped early at any time.

The same experiments can be run without the dashboard:

```powershell
scripts/chaos-start.ps1 -Type pod-failure -Service product-service -Duration 60
scripts/chaos-stop.ps1  -Type pod-failure -Service product-service
```

Canonical manifests live in `chaos/experiments/` and are documented in [`chaos/README.md`](chaos/README.md).

## Admin dashboard

`http://localhost:3000/admin` — the resilience control plane for the lab:

- **Status strip** — run mode (local lab / Kubernetes mesh), chaos guard state, Prometheus vs
  scrape source, cluster context, overall system status.
- **Service health grid** — live up/down/degraded state, latency and version per service.
- **Metric charts** — requests/s, error rate %, p95 latency per service over 5/15/30-minute windows.
- **Snapshots** — capture labelled baselines at any time and compare any two snapshots
  (before → after) with per-service deltas.
- **Chaos panel** — pick experiment, target and duration, watch a live countdown and the log
  output, stop early, and read the automatic before/after comparison for the affected service.

## API reference

All services share one error contract:
`{ "error": { "code", "message", "details"?, "requestId" } }` and expose `GET /health`
plus `GET /metrics` (Prometheus text format).

### user-service :4001
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/users?limit=` | list customers |
| GET | `/api/users/:id` | customer profile |
| POST | `/api/users` | create customer (zod-validated) |
| POST | `/api/users/resolve` | checkout identity — find by email or create |
| POST | `/api/users/validate` | existence check used by order-service |

### product-service :4002
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/products?search=&category=&sort=&page=&perPage=` | catalogue with filtering/sorting/pagination |
| GET | `/api/products/:id` | product by id **or** slug |
| GET | `/api/categories` | categories with counts and price ranges |
| GET | `/api/products/stats` | catalogue statistics |
| POST | `/api/products/stock/deduct` | atomic stock reservation `{orderId, items}` |
| POST | `/api/products/stock/restore` | idempotent compensation |

### order-service :4003
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/orders` | checkout (user resolve → prices → payment → stock → persist) |
| GET | `/api/orders/:id` | order by id |
| GET | `/api/orders?userId=&email=&limit=` | list orders |
| GET | `/api/orders/stats` | revenue/order statistics |
| GET | `/api/orders/deps` | dependency health + circuit-breaker states |

### ops-service :4004
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ops/health` | aggregated health of the three business services |
| GET | `/api/ops/status` | mode, chaos guard, cluster context, data sources |
| GET | `/api/ops/metrics?window=5m` | current RED metrics per service |
| GET | `/api/ops/metrics/history?window=15m` | time series for the charts |
| POST | `/api/ops/snapshots` | capture a labelled baseline |
| GET | `/api/ops/snapshots` · `GET /api/ops/compare/:before/:after` | list + compare snapshots |
| POST | `/api/ops/chaos` | start an experiment (guarded) |
| GET | `/api/ops/chaos` · `GET /api/ops/chaos/:id` | list / inspect experiments |
| POST | `/api/ops/chaos/:id/stop` | stop early + capture after-snapshot |

The browser never talks to the services directly — every call goes through Next.js route handlers
in `apps/web/src/app/api/*`, which forward `x-request-id` and `traceparent` for end-to-end correlation.

## Testing

```powershell
npm test              # unit + API tests of every workspace (vitest + supertest)
npm run typecheck     # strict TypeScript across all workspaces
npm run smoke         # end-to-end flow against a running dev stack
```

Coverage highlights: zod validation contracts, catalogue filtering/pagination, atomic stock
deduction with rollback, payment decline paths, pricing maths, the Prometheus text parser,
histogram quantiles, and the chaos guard rules.

## Windows-specific notes

- Use **PowerShell** or plain `cmd`. If PowerShell refuses `npm.ps1` (execution policy), call
  `npm.cmd` explicitly — every script in this repo already does.
- Long paths: if `npm install` fails with `ENAMETOOLONG`, enable long paths
  (`git config --system core.longpaths true` and the Windows policy `LongPathsEnabled=1`).
- Line endings: the repo ships `.editorconfig` (LF). Git's `autocrlf` is fine.
- Docker Desktop must be running **before** `docker compose` / `minikube start` (WSL2 backend
  recommended, 4+ CPUs and 8 GB RAM allocated to Docker Desktop).
- Scripts: `scripts/setup-windows.ps1`, `scripts/k8s-*.ps1`, `scripts/port-forward.ps1` and the
  chaos helpers all have `.sh` counterparts.

## Prerequisites and resource requirements

| Mode | Prerequisites | CPU / RAM / Disk |
|------|---------------|------------------|
| Lightweight dev | Node.js ≥ 20.10, npm ≥ 10 | 2 CPU / 2 GB / 1 GB |
| Docker Compose | + Docker 24+ | 4 CPU / 8 GB / 10 GB |
| Full mesh lab | + kubectl, Minikube, Istioctl ≥ 1.20, Helm 3, Chaos Mesh (helm) | 4 CPU / 8–10 GB / 20 GB |

Components that need **manual setup** (not automated on purpose): Istio (`istioctl install -y`),
Chaos Mesh (Helm install — commands in `docs/INFRA.md`), and pointing Grafana/Jaeger at the
collector in your own cluster. Everything else is provisioned by the scripts.

## Dissertation demo script

A polished 10-minute walkthrough (baseline → chaos → recovery → comparison) with the exact clicks
and PromQL is in [`docs/DEMO.md`); the infrastructure-focused variant is
[`chaos/manual-demo.md`](chaos/manual-demo.md).

## Licence / academic use

Built for academic use. The payment gateway is a deterministic mock; there is no real payment
processing and no real personal data.
