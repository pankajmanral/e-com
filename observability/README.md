# Observability — traces, metrics, dashboards

How observability flows through the Resilience Lab, which URLs to open, and
the PromQL used in the dissertation.

## Traces (OpenTelemetry → collector → Jaeger)

```
service (Node SDK, auto-instrumented express/fetch)
   │  OTLP/HTTP  POST /v1/traces
   ▼
otel-collector :4318  (receivers: otlp → processors: memory_limiter,
   │                    resource, batch → exporters: otlp/jaeger, debug)
   │  OTLP/gRPC
   ▼
jaeger all-in-one :4317  →  UI on :16686
```

* Every service calls `initTracing()` (see `packages/shared/src/tracing.ts`)
  before anything else, so express and outbound `fetch` are patched.
* Spans carry `service.name`, `service.version` and
  `deployment.environment.name` (the collector upserts the latter if the
  service didn't set it).
* If the collector is down, spans are dropped and the services keep serving —
  observability failure never becomes service failure.
* Long-form collector walkthrough: `observability/otel-collector/README.md`.

## Metrics (service /metrics → Prometheus → Grafana)

```
service /metrics (prom-client registry)
   ▲  scrape every 15s
prometheus :9090  (config: prometheus.compose.yml | prometheus.k8s.yml,
   │               rules: rules.yaml)
   ▼  query
grafana :3000 (host :3001 in compose / port-forward in k8s)
```

* Every service exports the same metric names with a `service` label —
  `http_requests_total{service,method,route,status}` and
  `http_request_duration_seconds{...}` (histogram) — plus prefixed process
  metrics (`<service>_...`). One scrape job and one dashboard cover all of
  them; queries always aggregate `sum by (service) (...)`.
* Recording rules pre-compute `http:request_rate`, `http:error_rate`,
  `http:p50_latency_seconds`, `http:p95_latency_seconds`
  (`observability/prometheus/rules.yaml`).
* Alerting rules: **HighErrorRate** (>5% for 2m), **HighP95Latency**
  (>1.5s for 3m), **ServiceDown** (`up == 0` for 1m), and a commented
  **CircuitLikelyOpen** hint rule that documents the outlier-ejection
  signature.
* The collector re-exposes its own metrics on `:8889/metrics` so you can
  prove the observer itself is healthy (job `otel-collector`).

## Dashboards and UIs to open

| What | Compose URL | Minikube (after port-forward) |
|------|-------------|-------------------------------|
| Grafana — "Resilience Lab — Service RED Metrics" | http://localhost:3001 | http://localhost:3001 |
| Jaeger UI — pick a service, Find Traces | http://localhost:16686 | http://localhost:16686 |
| Prometheus — Status → Targets, Graph | http://localhost:9090 | http://localhost:9090 |
| Collector self-metrics | http://localhost:8889/metrics | — (in-cluster only) |

The dashboard has a `$service` variable (multi-select, All = `.*`) and two
rows:

* **RED** — request rate, error rate %, p95, percentiles, status-class
  stacked traffic, top routes table.
* **Resilience** — `up` liveness, 5xx rate during chaos, success ratio stat,
  latency heatmap, and a text panel with the expected chaos timeline.

## Example PromQL used in the dissertation

```promql
# Request rate per service (dashboard panel + recording rule source)
sum by (service) (rate(http_requests_total[2m]))

# Error rate as a fraction (alert source; clamp_min avoids /0 at idle)
sum by (service) (rate(http_requests_total{status=~"5.."}[2m]))
  / clamp_min(sum by (service) (rate(http_requests_total[2m])), 0.0001)

# p95 latency from the histogram buckets
histogram_quantile(0.95,
  sum by (service, le) (rate(http_request_duration_seconds_bucket[2m])))

# Scrape-target liveness (drops to 0 during pod-failure chaos)
up{job="services"}

# Overall success ratio — the before/after number in the write-up
1 - (sum(rate(http_requests_total{status=~"5.."}[2m]))
     / clamp_min(sum(rate(http_requests_total[2m])), 0.0001))

# Error budget burn over the last hour (5% SLO)
(
  sum(increase(http_requests_total{status=~"5.."}[1h]))
  / clamp_min(sum(increase(http_requests_total[1h])), 1)
) / 0.05
```

## Configuration files

| File | Purpose |
|------|---------|
| `otel-collector/otel-collector.yaml` | collector pipeline (compose + k8s) |
| `prometheus/prometheus.compose.yml` | compose scrape targets (`user`, `product`, `order`, `ops`) |
| `prometheus/prometheus.k8s.yml` | in-cluster targets (`<svc>.ecommerce.svc.cluster.local`) |
| `prometheus/rules.yaml` | recording + alerting rules (both configs reference it) |
| `grafana/provisioning/datasources/datasources.yaml` | Prometheus + Jaeger datasources |
| `grafana/provisioning/dashboards/dashboards.yaml` | file provider for the dashboards dir |
| `grafana/dashboards/resilience-lab.json` | the RED/resilience dashboard |
