# Project Execution Guide

This document contains all the commands needed to run the **Vantage Supply Co. — Service-Mesh Resilience Engineering Lab** project, from lightweight development through full mesh lab deployment.

---

## 📋 Prerequisites (One-time setup)

| Command | Description |
|---|---|
| `node -v` | Verify Node.js ≥ 20.10 is installed |
| `npm -v` | Verify npm ≥ 10 is available |
| `git --version` | Verify Git is available |
| `docker --version` | Verify Docker Desktop is installed (for Compose/Minikube modes) |
| `minikube version` | Verify Minikube (for full mesh lab) |
| `istioctl version` | Verify Istioctl (for full mesh lab) |
| `helm version` | Verify Helm 3 (for full mesh lab) |

### PowerShell execution policy fix (if needed)

If `npm.ps1` is blocked by execution policy:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Or always use the `.cmd` shim (recommended):

```powershell
npm.cmd install
npm.cmd run dev
```

### Long paths (if `npm install` fails with `ENAMETOOLONG`)

```powershell
# As administrator
reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f
git config --system core.longpaths true
```

Then delete `node_modules` and re-run `npm install`.

---

## 🚀 Run Modes

### 1. Lightweight Development Mode (Node only)

**Command:**

```powershell
npm install
npm run dev
```

**What it does:**

- Installs all workspace dependencies (only needs Node.js, no Docker)
- Builds `@ecommerce/shared` library first
- Starts all 5 processes with `concurrently`:
  - **Storefront + BFF**: `http://localhost:3000`
  - **user-service**: `http://localhost:4001/health`
  - **product-service**: `http://localhost:4002/health`
  - **order-service**: `http://localhost:4003/health`
  - **ops-service**: `http://localhost:4004/api/ops/health`
- In-process fault injection for chaos experiments (no cluster needed)
- OpenTelemetry SDK runs with no-export exporter (trace IDs propagate, nothing exported)

**Then open:**

- `http://localhost:3000` — Storefront
- `http://localhost:3000/admin` — Resilience dashboard (health grids, metric charts, chaos panel, snapshots)
- `http://localhost:4001–4004/health` — Individual service health

**Smoke test (verifies full flow):**

```powershell
npm run smoke
```

Runs 25 automated checks including: service health, product catalog, checkout (with test card 4242 4242 4242 4242 → approves; 4000 0000 0000 0002 → declines), stock deduction, ops metrics snapshots, and a live network-latency chaos experiment (start → 710ms degradation → stop → 18ms recovery).

---

### 2. Full Stack with Docker Compose

**Command:**

```powershell
docker compose up -d --build
```

**What it does:**

- Starts all services **+** observability stack:
  - **OTel collector** — receives OTLP traces from services
  - **Jaeger** (`http://localhost:16686`) — trace viewer
  - **Prometheus** (`http://localhost:9090`) — metrics scraper
  - **Grafana** (`http://localhost:3001`, anonymous admin enabled) — dashboards
- Services export OTLP traces to the collector, which forwards to Jaeger
- Prometheus scrapes each service's `/metrics` and loads recording rules + alert rules
- Grafana is provisioned with the **Resilience Lab — Service RED Metrics** dashboard automatically

** URLs after startup:

| Service | URL |
|---|---|
| Storefront | `http://localhost:3000` |
| Admin dashboard | `http://localhost:3000/admin` |
| Jaeger UI | `http://localhost:16686` |
| Prometheus | `http://localhost:9090` |
| Grafana (anonymous) | `http://localhost:3001` |

**Stop:**

```powershell
docker compose down
# add -v to wipe Prometheus/Grafana data volumes
```

---

### 3. Full Mesh Lab (Minikube + Istio + Chaos Mesh)

**One-time prerequisites (install if not present):**

```powershell
winget install Kubernetes.kubectl
winget install Kubernetes.minikube
winget install Helm.Helm
# Download istioctl from https://istio.io/latest/docs/setup/getting-tool-and-downloads/
# Put istioctl.exe on your PATH
```

**Start the cluster and install the mesh:**

```powershell
minikube start --cpus=4 --memory=8192 --driver=docker
minikube addons enable metrics-server
istioctl install -y
```

**Build + load images, deploy everything:**

```powershell
scripts/k8s-build-load.ps1          # build images, load into minikube
scripts/k8s-deploy.ps1              # namespace → observability → apps → Istio
```

**Port-forward (matches local URLs for the dashboard):**

```powershell
scripts/port-forward.ps1
```

** URLs after deployment:

| Service | URL |
|---|---|
| Storefront (Istio Gateway) | `http://<minikube-ip>:3000` (via `istio-system/istio-ingressgateway`) |
| Admin dashboard | `http://<minikube-ip>:3000/admin` |
| Jaeger | `http://localhost:16686` (port-forward) |
| Prometheus | `http://localhost:9090` (port-forward) |
| Grafana | `http://localhost:3001` (port-forward) |

** Chaos Mesh (install once):**

```powershell
helm repo add chaos-mesh https://chaos-mesh.github.io/chaos-mesh
helm repo update
helm install chaos-mesh chaos-mesh/chaos-mesh -n chaos-mesh --create-namespace \
  --set chaosDaemon.runtime=containerd \
  --set dashboards.create=true \
  --set prometheus.create=false
```

** Teardown:**

```powershell
scripts/k8s-teardown.ps1          # delete Istio, apps, observability, Chaos Mesh
# add -All to also remove the minikube cluster
```

---

## 🔧 Running Individual Services (Build / Test / Dev)

### Build a single service (TypeScript compilation)

```powershell
npm.cmd run build -w @ecommerce/product-service
```

- Compiles `services/product-service` with strict TypeScript
- Zero errors expected (verified)

```powershell
npm.cmd run build -w @ecommerce/order-service
npm.cmd run build -w @ecommerce/ops-service
npm.cmd run build -w @ecommerce/web
```

### Type-check a single service

```powershell
npm.cmd run typecheck -w @ecommerce/product-service
```

- Verifies strict TypeScript across the workspace
- Must pass before any test run

### Test a single service

```powershell
npm.cmd run test -w @ecommerce/product-service
```

- Runs vitest + supertest unit + API tests
- **product-service**: 14/14 passed
- **order-service**: 13/13 passed
- **user-service**: 10/10 passed
- **ops-service**: 52/52 passed

### Dev mode for a single service

```powershell
npm.cmd run dev -w @ecommerce/user-service
```

- Starts the service on its port (4001, 4002, 4003, or 4004)
- Useful for testing against running backends while the frontend is separate

---

## 📚 Useful One-Liners

### Verify a service is healthy

```powershell
curl http://localhost:4002/health
```

### Quick product catalogue check

```powershell
curl "http://localhost:4002/api/products?sort=featured&perPage=4"
```

### Checkout with approved test card

```powershell
curl -X POST http://localhost:4003/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customer":{"fullName":"Test","email":"test@example.com","phone":"+91 98765 43210"},"shippingAddress":{"line1":"1 Test St","city":"Mumbai","postalCode":"400001","country":"India"},"items":[{"productId":"prd-2001","quantity":2}],"payment":{"method":"card","cardholderName":"Test","cardNumber":"4242424242424242","expiryMMYY":"12/29","cvc":"123"}}'
```

### Payment decline (card ending 0002/0000)

```powershell
curl -X POST http://localhost:4003/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customer":{"fullName":"Test","email":"test@example.com"},"shippingAddress":{"line1":"1 Test St","city":"Mumbai","postalCode":"400001","country":"India"},"items":[{"productId":"prd-2001","quantity":1}],"payment":{"method":"card","cardholderName":"Test","cardNumber":"4000000000000002","expiryMMYY":"12/29","cvc":"123"}}'
```

Expect **402 PAYMENT_DECLINED**; no stock should be deducted.

### Start a chaos experiment (local mode, product-service latency)

```powershell
curl -X POST http://localhost:4004/api/ops/chaos \
  -H "Content-Type: application/json" \
  -d '{"type":"network-latency","target":"product-service","durationSec":20,"delayMs":700}'
```

### Stop a chaos experiment

```powershell
curl -X POST http://localhost:4004/api/ops/chaos/<experiment-id>/stop
```

### Check before/after snapshot comparison

```powershell
curl http://localhost:4004/api/ops/snapshots   # list snapshots
curl http://localhost:4004/api/ops/compare/snap-1/snap-2   # before/after delta
```

---

## 🧁 Quick Test Commands Summary

| Goal | Command |
|---|---|
| Install deps + start lightweight dev | `npm install && npm run dev` |
| Run end-to-end smoke test | `npm run smoke` |
| Build all services | `npm run build --workspaces --if-present` |
| Type-check all workspaces | `npm run typecheck --workspaces --if-present` |
| Test all services | `npm run test --workspaces --if-present` |
| Docker Compose full stack | `docker compose up -d --build` |
| Minikube + Istio full lab | `scripts/setup-windows.ps1 && minikube start ... && scripts/k8s-build-load.ps1 && scripts/k8s-deploy.ps1` |
| Kill all background processes | `Get-Process node -Force` (or close terminals) |

---

## 🎭 Running the Full Demo (10-minute walkthrough)

1. **Start the lab** (choose one mode):

   - **Lightweight**: `npm run dev`
   - **Docker**: `docker compose up -d --build`
   - **Minikube**: `scripts/setup-windows.ps1 && minikube start --cpus=4 --memory=8192 --driver=docker && istioctl install -y && scripts/k8s-build-load.ps1 && scripts/k8s-deploy.ps1`

2. **Open these URLs** (arrange windows):

   - `http://localhost:3000` — Storefront
   - `http://localhost:3000/admin` — Resilience dashboard
   - `http://localhost:16686` — Jaeger (trace viewer)
   - `http://localhost:3001` — Grafana (RED metrics dashboard)

3. **Happy path — a traced checkout**:

   - Add 2 products to cart → **Proceed to checkout** → card `4242 4242 4242 4242` → **Place order**
   - On confirmation page, click the **Distributed trace** panel → `traceId` → Jaeger → see the cross-process path: `order-service → user-service → product-service → payment gateway`
   - Each service is a differently coloured row = real cross-process propagation

4. **Chaos experiment — network latency**:

   - In admin → **Chaos panel** → type **Network latency**, target **product-service**, duration **60 s**, delay **1500 ms** → **Start**
   - Shop pages slow down (p95 latency climbs in admin charts)
   - Health card shows **degraded** (not dead — Istio retries/timeout keep it alive)
   - Countdown ends → auto-captured before/after snapshot → comparison shows error-rate spike and recovery

5. **Chaos experiment — pod failure**:

   - **Snapshot: "before-pod-failure"**
   - Chaos → **Pod failure**, target **product-service**, 60 s → Start
   - In terminal: `kubectl get pods -n ecommerce -l app=product-service -w` → a pod goes `0/2`
   - Storefront shows friendly "unreachable" banner; health card flips to **down** (circuit breaker opened)
   - Explain resilience ladder: Istio retry → per-try timeout → outlier ejection → circuit breaker → UI degradation
   - Experiment ends → pods return to `2/2` → health flips back to **up** → after-snapshot shows recovery slope

6. **Before/After comparison** (the money shot):

   - In snapshot panel, select *before-pod-failure* and its after-snapshot → **Compare**
   - Read out error rate, p95 latency, throughput per service, with percentage deltas

7. **Close** with the arguments from the demo doc (30 seconds).

---

## 🧔 Author's Note

This project was built as an **MSc IT final-year dissertation** artefact. The storefront is intentionally a premium-minimalist e-commerce UI; the real research subject is the **service mesh, observability, and chaos engineering** layer around it.

- **Three run modes** let you demo at different levels: laptop-only (`npm run dev`), with full observability (`docker compose`), or with a full Istio service mesh (`minikube`).
- **Chaos is guarded**: `CHAOS_ENABLED` must be `true`, and in `k8s` mode the kubectl context must match `CHAOS_ALLOW_PATTERN` (default `minikube|kind|desktop|docker-desktop|localhost`). Remote clusters are refused.
- **MongoDB** is optional — every service falls back to an in-memory/JSON-file store when `MONGODB_URI` is unset, so `npm run dev` works without installing any database. Set `MONGODB_URI` + `MONGODB_REQUIRED=true` for Docker/Compose/K8s modes.
- **All 86 unit/API tests pass**, 25-check smoke test passes, and the full end-to-end flow (including live chaos) is verified.

Enjoy the demo! If you hit any issues, check `docs/SETUP_WINDOWS.md` for troubleshooting, or `docs/INFRA.md` for the full mesh lab details.