#!/usr/bin/env bash
# Starts a Chaos Mesh experiment against the Resilience Lab (thin wrapper
# around kubectl apply of the canonical manifests in chaos/experiments/).
#
#   ./scripts/chaos-start.sh                                  # pod-failure defaults
#   ./scripts/chaos-start.sh network-latency product-service 120s
#
# Safety: refuses to run unless the current kubectl context matches
# minikube|kind|desktop|docker-desktop|localhost — the same guard the
# ops-service admin dashboard enforces. Bypass with FORCE=1 (don't).
#
# Equivalent admin-dashboard action: pick the same experiment + duration on
# the resilience admin page (http://localhost:3000/admin).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TYPE="${1:-pod-failure}"
SERVICE="${2:-product-service}"
DURATION="${3:-60s}"
FORCE="${FORCE:-0}"

case "$TYPE" in
  pod-failure|network-latency|service-outage) ;;
  *) echo "unknown type '$TYPE' (pod-failure | network-latency | service-outage)" >&2; exit 1 ;;
esac
case "$SERVICE" in
  product-service|user-service|order-service|ops-service) ;;
  *) echo "unknown service '$SERVICE'" >&2; exit 1 ;;
esac

MANIFEST="chaos/experiments/$TYPE.yaml"
if [ ! -f "$MANIFEST" ]; then
  echo "manifest not found: $MANIFEST" >&2
  exit 1
fi

# --- safety rail: context allow-pattern (mirror of the ops-service guard) ---
CONTEXT="$(kubectl config current-context 2>/dev/null || true)"
if [ -z "$CONTEXT" ]; then
  echo "No kubectl context — is the cluster running?" >&2
  exit 1
fi
ALLOW_PATTERN='minikube|kind|desktop|docker-desktop|localhost'
if ! printf '%s' "$CONTEXT" | grep -Eq "$ALLOW_PATTERN"; then
  if [ "$FORCE" != "1" ]; then
    echo "REFUSING: kubectl context '$CONTEXT' does not match '$ALLOW_PATTERN'." >&2
    echo "Chaos experiments only run against local lab clusters. FORCE=1 to override (don't)." >&2
    exit 1
  fi
  echo "WARNING: proceeding against context '$CONTEXT' because of FORCE=1."
fi

# --- apply with parameter substitution --------------------------------------
echo "==> applying $TYPE (target app=$SERVICE, duration=$DURATION)"
kubectl apply -f "$MANIFEST"

KIND="$( [ "$TYPE" = "pod-failure" ] && echo podchaos || echo networkchaos )"
# Patch duration + selector so the wrapper's arguments win over the
# manifest's defaults (metadata.name is immutable and stays the same).
if [ "$TYPE" = "pod-failure" ]; then
  OBJ="podchaos/product-service-pod-failure"
elif [ "$TYPE" = "network-latency" ]; then
  OBJ="networkchaos/product-service-network-latency"
else
  OBJ="networkchaos/product-service-network-outage"
fi
if kubectl -n ecommerce get "$OBJ" >/dev/null 2>&1; then
  kubectl -n ecommerce patch "$OBJ" --type merge \
    -p "{\"spec\":{\"duration\":\"$DURATION\",\"selector\":{\"labelSelectors\":{\"app\":\"$SERVICE\"}}}}" \
    || echo "patch failed — running with the manifest's defaults" >&2
else
  echo "Could not patch $OBJ — check: kubectl -n ecommerce get $KIND" >&2
fi

echo ""
echo "==> experiment running. Watch it with:"
echo "   kubectl -n ecommerce get $KIND -w"
echo "Dashboard: http://localhost:3001 (Resilience Lab) — expected timeline in chaos/README.md"
echo ""
echo "Recover now:  ./scripts/chaos-stop.sh $TYPE"
