#!/usr/bin/env bash
# Tears the Resilience Lab down, in reverse dependency order.
#
#   ./scripts/k8s-teardown.sh                  # keep cluster
#   ./scripts/k8s-teardown.sh --all            # also `minikube delete`
#   ./scripts/k8s-teardown.sh --keep-observability
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ALL=false
KEEP_OBSERVABILITY=false
for arg in "$@"; do
  case "$arg" in
    --all) ALL=true ;;
    --keep-observability) KEEP_OBSERVABILITY=true ;;
    *) echo "unknown flag: $arg (supported: --all, --keep-observability)" >&2; exit 1 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }

step "removing chaos experiments (must go first — they target live pods)"
kubectl -n ecommerce delete podchaos --all --ignore-not-found=true 2>/dev/null || true
kubectl -n ecommerce delete networkchaos --all --ignore-not-found=true 2>/dev/null || true
kubectl delete -f chaos/experiments --ignore-not-found=true 2>/dev/null || true

step "removing istio routing + resilience policy"
kubectl delete -f k8s/istio/virtual-services.yaml --ignore-not-found=true 2>/dev/null || true
kubectl delete -f k8s/istio/destination-rules.yaml --ignore-not-found=true 2>/dev/null || true
kubectl delete -f k8s/istio/gateway.yaml --ignore-not-found=true 2>/dev/null || true
# Fault-injection VirtualServices the ops-service applies dynamically.
kubectl -n ecommerce delete virtualservice product-service-fault-injection --ignore-not-found=true 2>/dev/null || true

step "removing application manifests"
kubectl delete -f k8s/product-service-v2.yaml --ignore-not-found=true 2>/dev/null || true
for file in k8s/frontend.yaml k8s/ops-service.yaml k8s/order-service.yaml k8s/product-service.yaml k8s/user-service.yaml; do
  kubectl delete -f "$file" --ignore-not-found=true 2>/dev/null || true
done
kubectl delete -f k8s/configmap.yaml --ignore-not-found=true 2>/dev/null || true

if [ "$KEEP_OBSERVABILITY" = true ]; then
  step "keeping observability (--keep-observability)"
else
  step "removing observability stack"
  for file in k8s/observability/grafana.yaml k8s/observability/prometheus.yaml k8s/observability/jaeger.yaml k8s/observability/otel-collector.yaml k8s/observability/grafana-dashboard.yaml; do
    kubectl delete -f "$file" --ignore-not-found=true 2>/dev/null || true
  done
  step "removing observability namespace"
  kubectl delete namespace observability --ignore-not-found=true --timeout=120s 2>/dev/null || true
fi

step "removing ecommerce namespace"
kubectl delete namespace ecommerce --ignore-not-found=true --timeout=120s 2>/dev/null || true

if [ "$ALL" = true ]; then
  step "deleting the minikube cluster (--all)"
  minikube delete || echo "minikube delete failed — is it installed?" >&2
else
  echo ""
  echo "Cluster left running. To delete it:  ./scripts/k8s-teardown.sh --all"
  echo "To redeploy:                        ./scripts/k8s-deploy.sh"
fi
echo ""
echo "==> teardown complete"
