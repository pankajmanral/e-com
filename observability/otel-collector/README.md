# OpenTelemetry Collector — how the pipeline works
#
# This file explains the config in `otel-collector.yaml` for the dissertation
# demo. The collector is the single observability "front door" for every
# service: applications never talk to Jaeger or Prometheus directly for
# traces; they only speak OTLP to the collector.

## The pipeline at a glance

    ┌──────────────┐   OTLP    ┌──────────────────────────────────────────┐
    │ user-service │──────────▶│  receivers: otlp  (:4317 gRPC, :4318 HTTP)│
    │ product-svc  │──────────▶│                                          │
    │ order-service│──────────▶│  processors:                             │
    │ ops-service  │──────────▶│    memory_limiter → resource → batch     │
    └──────────────┘           │                                          │
                               │  exporters:                              │
                               │    otlp/jaeger → jaeger:4317  (traces)   │
                               │    debug       → collector logs          │
                               │    prometheus  → :8889 (self-metrics)    │
                               └──────────────────────────────────────────┘

1. **Receivers** accept OTLP from the Node SDK
   (`@opentelemetry/exporter-trace-otlp-http` posts to `/v1/traces` on the
   HTTP port). Both gRPC and HTTP receivers are enabled for interoperability.
2. **Processors** run in order per pipeline:
   - `memory_limiter` caps collector memory and sheds load instead of
     OOM-ing — in a resilience lab the observer must never be the outage.
   - `resource` upserts `deployment.environment.name` so traces can be
     filtered by environment in Jaeger.
   - `batch` groups spans into fewer, larger exports (lower overhead).
3. **Exporters** fan the data out: spans go to Jaeger (OTLP gRPC) and to the
   collector log (`debug`, for live demo feedback); the collector's own
   metrics are re-exposed on `:8889/metrics` for Prometheus.

## Ports

| Port | Protocol             | Purpose                              |
|------|----------------------|--------------------------------------|
| 4317 | OTLP gRPC            | service ingest + Jaeger upstream     |
| 4318 | OTLP HTTP            | service ingest (Node SDK default)    |
| 8889 | Prometheus scrape     | collector self-metrics               |
| 8888 | Prometheus           | collector internal telemetry         |

## Service-side contract

Each service enables OTLP export only when both are set:

    OTEL_TRACES_EXPORTER=otlp
    OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318   # compose
    # in-cluster: http://otel-collector.observability.svc.cluster.local:4318

If the collector is unreachable, spans are dropped with a logged error — the
services keep serving traffic. That failure isolation is itself a teaching
point during the chaos experiments.
