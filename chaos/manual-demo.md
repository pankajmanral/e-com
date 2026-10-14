# Manual demo script — the dissertation demonstration

A step-by-step script (~10 minutes) showing a fault being injected, the
mesh + app resilience mechanisms reacting, and the system recovering.
Prerequisite: the full Minikube lab running (see `k8s/README.md`) with all
port-forwards up (`scripts/port-forward.ps1`).

**URLs used below** (all from the port-forward script):

| What | URL |
|------|-----|
| Storefront | http://localhost:3000 |
| Grafana — "Resilience Lab — Service RED Metrics" | http://localhost:3001 |
| Jaeger UI | http://localhost:16686 |
| Prometheus | http://localhost:9090 |
| ops-service API | http://localhost:4004/api/ops |

> All URLs match `scripts/port-forward.ps1` and the compose stack, so the
> demo looks identical in every run mode. If a port is already taken on your
> machine (e.g. compose + k8s running side by side), stop one stack or edit
> the forward list.

---

## 0. Pre-flight (2 min)

```powershell
kubectl get pods -n ecommerce        # all 2/2 Running (app + sidecar)
kubectl get pods -n observability    # collector, jaeger, prometheus, grafana
kubectl get destinationrule -n ecommerce   # 4 circuit-breaker rules
```

1. Open **Grafana** → dashboard "Resilience Lab — Service RED Metrics".
   Set the time range to **now-30m**, refresh **10s**, leave `$service = All`.
2. Open **Jaeger** → service `product-service` → operation `GET /api/products`
   → Find Traces. Show one successful trace with its spans: storefront →
   order/product services, proving the pipeline works.
3. Generate steady traffic so the graphs are alive (a browser tab on the
   storefront clicking around, or):

   ```powershell
   1..200 | ForEach-Object {
     Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/products | Out-Null
     Start-Sleep -Milliseconds 250
   }
   ```

4. **Take the BEFORE screenshot** of the whole dashboard.

## 1. Inject the fault (1 min)

Canonical experiment — `chaos/experiments/pod-failure.yaml`, 60 seconds,
one product-service pod:

```powershell
scripts/chaos-start.ps1 -Type pod-failure -Service product-service -Duration 60s
```

(equivalent admin-dashboard action: *Chaos → Pod failure → product-service →
60s → Start*; or plain `kubectl apply -f chaos/experiments/pod-failure.yaml`)

Confirm the control plane sees it:

```powershell
kubectl get podchaos -n ecommerce
```

## 2. Observe the blast (2-3 min) — narrate in this order

1. **Grafana → "Service liveness (up == 1 healthy)"**: one product-service
   instance drops to **0** (the killed pod) while the other stays 1. The
   **ServiceDown** alert appears under Prometheus → Alerts.
2. **Grafana → "Error rate (%)"**: a short spike on product-service, then a
   plateau — this is Istio retries (`connect-failure`, 3 attempts) absorbing
   most in-flight losses. If the spike stays at zero, that is also a result:
   the retries fully masked the failure; say so.
3. **Grafana → "p95 latency"**: brief bump from the retry overhead
   (each retry adds up to `perTryTimeout=1s`).
4. **Jaeger** → find a trace from the spike window: the product-service
   client span shows repeated attempts; the successful one carries a
   different upstream pod address in `peer.address`.
5. **Circuit breaker evidence** — the ops-service breaker state:

   ```powershell
   Invoke-WebRequest http://localhost:4004/api/ops/breakers | ConvertFrom-Json
   ```

   product-service entries show elevated failure counts; with enough
   sustained 5xx the Istio outlier detector would eject the pod
   (`kubectl -n ecommerce get pod -o wide` shows which pod lost traffic).

## 3. Recovery (1-2 min)

The experiment auto-expires after 60s (or `scripts/chaos-stop.ps1 -Type
pod-failure`). Watch, in order:

1. `up` returns to **1** for the replacement pod (~10-20s scheduling +
   readiness).
2. Error rate falls back to teal; p95 flattens.
3. Run the traffic loop from step 0.3 again and confirm clean p95 in Jaeger.

## 4. AFTER evidence + comparison (2 min)

1. **Screenshot the dashboard again** with the same time range — the spike
   and its recovery now sit in one graph; that single image is the core
   dissertation figure.
2. Quantify the damage (Prometheus → Graph):

   ```promql
   # total failed product-service requests during the experiment window
   increase(http_requests_total{service="product-service",status=~"5.."}[10m])
   ```

   Compare against total requests in the same window — the ratio (typically
   < a few %) is the numeric argument for mesh retries.
3. Export the best "retry" trace from Jaeger (Share → Copy link) and embed it
   in the write-up next to the before/after graphs.

## 5. Bonus variants (5 min each, same script shape)

| Variant | Command | What changes in the story |
|---------|---------|---------------------------|
| Latency | `scripts/chaos-start.ps1 -Type network-latency -Service product-service -Duration 120s` | p95/p99 climb ~200-250ms, error rate stays ~0 — latency budgets, not retries, are the defence |
| Outage | `scripts/chaos-start.ps1 -Type service-outage -Service product-service -Duration 90s` | probes stay green, mesh sees black hole: error rate → ~100%, upstream breakers shed load |
| Canary | `kubectl apply -f k8s/product-service-v2.yaml` + enable the weighted VirtualService | 10% of traffic serves v2; combine with latency chaos to show canary rollback reasoning |

Cleanup check after the demo:

```powershell
kubectl get podchaos,networkchaos -n ecommerce   # must be empty
kubectl get virtualservice -n ecommerce          # no *-fault-injection objects
```
