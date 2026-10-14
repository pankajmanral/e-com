# Chaos engineering — experiments, safety rails, and evidence capture

This directory is the **canonical home of every Chaos Mesh manifest** used by
the lab (`k8s/chaos/*.yaml` are pointer stubs that reference these files —
decision recorded in `docs/INFRA.md`).

## The experiments

| File | Chaos Mesh CR | Failure model | Blast radius |
|------|---------------|---------------|--------------|
| `experiments/pod-failure.yaml` | `PodChaos` (podFailure) | Pod SIGKILLed, replacement starts | 1 product-service pod, 60s |
| `experiments/network-latency.yaml` | `NetworkChaos` (delay) | +200ms ± 50ms on egress | all product-service pods, 2m |
| `experiments/service-outage.yaml` | `NetworkChaos` (partition) | Full black hole in+out | all product-service pods, 90s |

All three target `labelSelector: app=product-service` in the `ecommerce`
namespace, have a fixed `duration`, and therefore **auto-revert**. Chaos Mesh
stores them in etcd — deleting the object ends the experiment early.

### What each one teaches

* **pod-failure** — the involuntary cousin of a PDB-protected drain. Watch
  `up` go 0→1 on a new pod and Istio's `connect-failure` retries absorb the
  in-flight losses. Compare with `kubectl drain` (voluntary, PDB respects).
* **network-latency** — "it works but slowly". Retries cannot fix this;
  timeouts must bound it. p95/p99 on the Grafana dashboard move first, the
  error rate barely does. Shows why latency SLOs need their own alerts
  (`HighP95Latency` in `observability/prometheus/rules.yaml`).
* **service-outage** — the probe-blind failure: pods stay `Running` and
  `/health` still answers, so only the mesh sees the outage. Outlier
  detection + connection-pool limits in `k8s/istio/destination-rules.yaml`
  are what stop the failure cascading into order-service and the storefront.

## Safety rails — why this cannot hit production by accident

Three independent gates must ALL pass before anything is applied:

1. **`CHAOS_ENABLED`** (ConfigMap `ecommerce-config`) — the ops-service
   refuses every chaos API call unless this is `true`.
2. **`CHAOS_ALLOW_PATTERN`** — the ops-service checks the active kubectl
   context name against `minikube|kind|desktop|docker-desktop|localhost`
   and rejects anything else (e.g. a context accidentally pointed at a real
   cluster).
3. **`CHAOS_NAMESPACE=ecommerce`** — experiments are namespaced; the Role in
   `k8s/ops-service.yaml` grants chaos verbs only inside `ecommerce`, and the
   service account is per-deployment (no `default` SA anywhere).

The manual scripts (`scripts/chaos-start.ps1` / `.sh`) implement gate 2 as
well: they refuse to run unless the current context matches the same
pattern, unless you pass `-Force`.

Plus the manifests themselves are scoped: `labelSelectors` only match
product-service pods, durations are bounded, and `mode: one` caps
pod-failure at a single replica.

## Running an experiment

### From the admin dashboard (the intended demo path)

1. Open the storefront admin (compose: http://localhost:3000, minikube:
   `minikube service frontend -n ecommerce` or the port-forward).
2. Go to the resilience/chaos page → pick experiment + duration → Start.
3. The ops-service applies the equivalent of `chaos/experiments/*.yaml`
   through the Kubernetes API and shows live state + auto-delete countdown.

### Manually with kubectl (appendix reproducibility)

```sh
kubectl apply   -f chaos/experiments/pod-failure.yaml
kubectl get podchaos -n ecommerce -w          # watch STATUS turn to "Running"
kubectl delete  -f chaos/experiments/pod-failure.yaml   # recover now
```

### Via the wrapper scripts

```powershell
scripts/chaos-start.ps1 -Type pod-failure -Service product-service -Duration 60s
scripts/chaos-stop.ps1  -Type pod-failure
```

```sh
./scripts/chaos-start.sh pod-failure product-service 60s
./scripts/chaos-stop.sh  pod-failure
```

## Expected observation timeline (pod-failure, the canonical demo)

```
t+0s    experiment starts; pod SIGKILLed
t+1-3s  Grafana: error-rate tick, `up` = 0 for the dead instance
        Jaeger: caller spans show retries (connect-failure) then success
t+5-15s replacement pod schedules, passes readiness
t+15-30s `up` back to 1, error rate back to teal, p95 flat
```

If the error rate does NOT recover, the breaker stayed open or the
replacement is crash-looping — `kubectl -n ecommerce get pods -w` and the
collector debug exporter logs tell you which.

## Collecting before/after evidence for the dissertation

1. **Before** — with the stack idle: screenshot the Grafana dashboard
   (`now-30m`), export one trace from Jaeger (a product listing fetch), and
   save the alert list: `kubectl -n observability port-forward svc/prometheus 9090:9090`
   → http://localhost:9090/alerts.
2. **During** — record the dashboard (or take 3 screenshots at t+5s, t+30s,
   t+90s), keep the Jaeger trace IDs shown in the order-service logs
   (`x-trace-id` response header also works), and note
   `kubectl get podchaos -n ecommerce -o yaml` status transitions.
3. **After** — repeat step 1 exactly (same time range), then diff:
   * error-rate graph before/after overlay
   * p95 before/after numbers (table in the write-up)
   * the recovery time measured from the 5xx graph
4. **PromQL for the numbers** (see `observability/README.md`): use
   `increase(http_requests_total{status=~"5.."}[10m])` around the experiment
   window to quantify total failed requests — that is the number the
   retry/breaker configuration is supposed to keep small.
