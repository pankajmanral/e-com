# Demonstration Script (10 minutes)

This is the guided walkthrough for the viva / video recording. It assumes the **Docker Compose**
or **Minikube** mode so that traces and dashboards are available; section B also works in the
lightweight `npm run dev` mode.

Print this page, or keep it on a second screen.

---

## A. Before the demo (5 minutes, once)

```powershell
docker compose up -d --build        # or: scripts/k8s-deploy.ps1
npm run dev                         # storefront (skip if compose already serves :3000)
```

Open and arrange four windows:

1. Storefront — http://localhost:3000
2. Admin dashboard — http://localhost:3000/admin
3. Grafana — http://localhost:3001 (dashboard *Resilience Lab — Service RED Metrics*)
4. Jaeger — http://localhost:16686 (service filter: `order-service`)

**Talking point:** show the architecture diagram (README §Architecture) and state the thesis of the
project — a normal e-commerce system whose *resilience* is measured rather than assumed.

---

## B. Happy path: a fully traced checkout (2 minutes)

1. Shop → open **two different products**, add 1–2 units each to the cart.
2. Cart → **Proceed to checkout** → fill the form → card `4242 4242 4242 4242`, any future expiry,
   any CVC → **Place order**.
3. On the confirmation page, point at the **Distributed trace** panel: a 32-character `traceId`
   with an *Open in Jaeger* link.
4. Click the link. In Jaeger, expand the trace and narrate the path:
   `order-service POST /api/orders → user-service /api/users/resolve → product-service
   GET /api/products/:id (×2) → POST /api/products/stock/deduct → payment gateway span`.
   Each service is a differently coloured row — proof of real cross-process propagation
   (W3C `traceparent`).
5. Optional flourish: place a second order with card `4000 0000 0000 0002` — it fails with
   *"Card was declined"* (HTTP 402) and **no stock is reserved** (check product stock in Grafana or
   `GET :4002/api/products/:id`).

**Talking point:** observability is not a bolt-on; the traceId is generated in `order-service` and
returned to the UI, joining backend traces to a user-visible artefact.

---

## C. Chaos experiments from the admin dashboard (5 minutes)

Go to **/admin**. Explain the status strip: run mode, chaos guard state, metrics source,
cluster context. Take a labelled **snapshot: "baseline"** while the system is idle.

### C1. Network latency (Istio-style degraded dependency)

1. Chaos panel → type **Network latency**, target **product-service**, duration **60 s**,
   delay **1500 ms** → **Start** (confirm dialog).
2. Immediately shop and open a product page: it is noticeably slow — the BFF waits on
   `product-service` through the mesh (in k8s mode: Istio `VirtualService` fault injection;
   in local mode: the service's own fault middleware).
3. Watch the admin charts: p95 latency for `product-service` (and `order-service`, which depends on
   it) climbs; the health card still says **up** (degraded, not dead).
4. Grafana: zoom the p95 panel to the last 10 minutes. Point out the Istio retry/timeout config
   (`timeout: 3s`, `attempts: 3`) that keeps a slow dependency from becoming an outage.
5. The countdown ends → the ops-service captures an **after** snapshot automatically and the result
   card shows before → after deltas (p95 up ×, error rate ~0 %).

### C2. Pod failure (real Chaos Mesh in k8s mode)

1. **Snapshot: "before-pod-failure"**.
2. Chaos → **Pod failure**, target **product-service**, duration **60 s** → Start.
3. In a terminal: `kubectl get pods -n ecommerce -l app=product-service -w` — a pod goes
   `0/2` (kubelet kills containers; Istio sidecar included).
4. Storefront product pages now return the BFF's friendly *"product-service is unreachable"*
   banner; the admin health card flips to **down** after the circuit breaker opens
   (`GET :4003/api/orders/deps` shows `CIRCUIT_OPEN`).
5. Explain the resilience ladder, in order: **Istio retry → per-try timeout → outlier ejection →
   service circuit breaker → UI degradation**.
6. Experiment auto-ends, pods return to `2/2`, health flips back to **up** within seconds — the
   after-snapshot shows the error-rate spike and the recovery slope.

### C3. Service outage (partition)

1. **Snapshot: "before-outage"** → **Service outage** on **user-service**, 45 s.
2. Place an order during the outage: it fails with a clear 503 and the checkout stays usable for
   products (user-service is only needed for identity resolution) — narrate the dependency graph.
3. Recovery is automatic; compare snapshots "before-outage" → automatic after-snapshot.

### C4. The before/after comparison (the money shot)

In the snapshot panel, select *before-pod-failure* and its after-snapshot → **Compare**. Read out:
error rate, p95 latency and throughput per service, with percentage deltas. Mention that the same
comparison is what the dissertation plots use, and that the data behind it is Prometheus
(`query_range`) or the ops-service's own 5-second scrape history when Prometheus is absent.

---

## D. Closing arguments (30 seconds)

- The application is a **real four-service system** with validation, retries, circuit breakers and
  compensation — not a mock.
- Failures are **injected deliberately and bounded**: chaos is off by default, restricted to local
  clusters by a kubectl-context guard, and every run produces measurable before/after evidence.
- The same three experiments can be run from the dashboard, from `scripts/chaos-*.ps1`, or from
  `kubectl apply -f chaos/experiments/…` — the dashboard is a UX over the same APIs.

---

## Backup material (if something is slow to start)

- Show `npm run smoke` output — it proves the whole flow end-to-end, including chaos, in one run.
- Show `docs/INFRA.md` (mesh configuration table) and `istioctl proxy-status`.
- Show the alerting rules in `observability/prometheus/rules.yaml` and fire one manually in
  Prometheus to demo the `HighErrorRate` alert.

## Clean-up between takes

```powershell
# stop any experiment still running (dashboard Stop button or:)
scripts/chaos-stop.ps1 -Type pod-failure -Service product-service
# reset local data (order history):
Remove-Item services\order-service\data\orders.json -ErrorAction SilentlyContinue
```
