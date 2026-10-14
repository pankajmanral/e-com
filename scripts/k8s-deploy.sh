#!/usr/bin/env bash
# Ordered deployment of the full Resilience Lab into Minikube.
#
#   ./scripts/k8s-deploy.sh
#   ./scripts/k8s-deploy.sh --skip-observability
#   TAG=1.1.0 ./scripts/k8s-deploy.sh
#
# Apply order (dependencies first):
#   1. namespaces  2. config (+ secrets)  3. observability  4. apps
#   5. istio routing/policy  6. rollout waits + access instructions
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKIP_OBSERVABILITY=false
TAG="${TAG:-1.0.0}"
for arg in "$@"; do
  case "$arg" in
    --skip-observability) SKIP_OBSERVABILITY=true ;;
    *) echo "unknown flag: $arg (only --skip-observability is supported)" >&2; exit 1 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }
apply() { # apply <file> <failure-message>
  if ! kubectl apply -f "$1"; then
    echo "$2" >&2
    exit 1
  fi
}

step "1/6 namespaces"
apply k8s/namespace.yaml "namespace apply failed"
apply k8s/observability/namespace.yaml "observability namespace apply failed"

step "2/6 shared config (+ secrets when present)"
apply k8s/configmap.yaml "configmap apply failed"
if [ -f k8s/secrets.yaml ]; then
  apply k8s/secrets.yaml "secrets apply failed"
else
  echo "    k8s/secrets.yaml not found — using defaults (copy k8s/secret.example.yaml to override)"
fi

if [ "$SKIP_OBSERVABILITY" = true ]; then
  step "3/6 observability SKIPPED (--skip-observability)"
else
  step "3/6 observability stack"
  apply k8s/observability/otel-collector.yaml "otel-collector apply failed"
  apply k8s/observability/jaeger.yaml "jaeger apply failed"
  apply k8s/observability/prometheus.yaml "prometheus apply failed"
  apply k8s/observability/grafana-dashboard.yaml "grafana dashboard apply failed"
  apply k8s/observability/grafana.yaml "grafana apply failed"
fi

step "4/6 application manifests (tag $TAG)"
for file in k8s/user-service.yaml k8s/product-service.yaml k8s/order-service.yaml k8s/ops-service.yaml k8s/frontend.yaml; do
  apply "$file" "$file apply failed"
done
if [ "$TAG" != "1.0.0" ]; then
  for deploy in user-service product-service order-service ops-service; do
    kubectl -n ecommerce set image "deploy/$deploy" "$deploy=ecommerce/$deploy:$TAG"
  done
  kubectl -n ecommerce set image deploy/frontend "frontend=ecommerce/web:$TAG"
fi

step "5/6 istio routing + resilience policy"
apply k8s/istio/gateway.yaml "gateway apply failed"
apply k8s/istio/destination-rules.yaml "destination rules apply failed"
apply k8s/istio/virtual-services.yaml "virtual services apply failed"

step "6/6 waiting for rollouts"
if [ "$SKIP_OBSERVABILITY" = false ]; then
  for deploy in otel-collector jaeger prometheus grafana; do
    if ! kubectl -n observability rollout status "deploy/$deploy" --timeout=180s; then
      echo "rollout of $deploy did not complete; check: kubectl -n observability get pods" >&2
      exit 1
    fi
  done
fi
for deploy in user-service product-service order-service ops-service frontend; do
  if ! kubectl -n ecommerce rollout status "deploy/$deploy" --timeout=180s; then
    echo "rollout of $deploy did not complete; check: kubectl -n ecommerce get pods" >&2
    echo "If pods show 1/2 with istio-proxy Error, restart after injection:"
    echo "  kubectl -n ecommerce rollout restart deploy"
    exit 1
  fi
done

printf '\n==> lab deployed\n\n'
echo "Verify:      kubectl get pods -n ecommerce        (expect 2/2 per pod)"
echo "             kubectl get pods -n observability"
echo "Access:      ./scripts/port-forward.sh  (Jaeger/Prometheus/Grafana/frontend)"
echo "Ingress:     minikube ip  ->  http://<ip>/   (Istio ingressgateway :80)"
echo "Chaos demo:  ./scripts/chaos-start.sh pod-failure product-service 60s"
echo "             full walkthrough: chaos/manual-demo.md"
