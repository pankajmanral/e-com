#!/usr/bin/env bash
# Starts kubectl port-forwards so the lab matches the local demo URLs.
#
#   ./scripts/port-forward.sh
#   ./scripts/port-forward.sh --skip-ingress
#   ./scripts/port-forward.sh --skip-frontend
#
# Forwards:
#   Jaeger 16686, Prometheus 9090, Grafana 3001 (observability ns)
#   frontend 3000, ops-service 4004 (ecommerce ns)
#   istio-ingressgateway 8080 (istio-system ns, optional)
# Runs until Ctrl+C, then kills every forward.
set -uo pipefail

SKIP_INGRESS=false
SKIP_FRONTEND=false
for arg in "$@"; do
  case "$arg" in
    --skip-ingress) SKIP_INGRESS=true ;;
    --skip-frontend) SKIP_FRONTEND=true ;;
    *) echo "unknown flag: $arg (supported: --skip-ingress, --skip-frontend)" >&2; exit 1 ;;
  esac
done

PIDS=()
cleanup() {
  echo ""
  echo "==> stopping port-forwards"
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

forward() { # forward <ns> <svc> <local> <remote>
  kubectl -n "$1" port-forward "svc/$2" "$3:$4" >/dev/null 2>&1 &
  PIDS+=($!)
  printf '==> %-10s http://localhost:%s  ->  %s/%s:%s\n' "$2" "$3" "$1" "$2" "$4"
}

forward observability jaeger     16686 16686
forward observability prometheus 9090  9090
forward observability grafana    3001  3000
if [ "$SKIP_FRONTEND" = false ]; then
  forward ecommerce frontend     3000  3000
  forward ecommerce ops-service  4004  4004
fi
if [ "$SKIP_INGRESS" = false ]; then
  forward istio-system istio-ingressgateway 8080 80
fi

cat <<'URLS'

All forwards up. URLs for the demo:
  Storefront + admin   http://localhost:3000
  Grafana (dashboard)  http://localhost:3001   (Resilience Lab — Service RED Metrics)
  Jaeger UI            http://localhost:16686
  Prometheus           http://localhost:9090
  ops-service API      http://localhost:4004/api/ops
  Istio ingressgateway http://localhost:8080

Press Ctrl+C to stop all forwards.
URLS

# Wait for any forward to die (they shouldn't unless the cluster went away).
wait
