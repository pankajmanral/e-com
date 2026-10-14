#!/usr/bin/env bash
# Stops a Chaos Mesh experiment started by scripts/chaos-start.sh (or the
# admin dashboard / a manual kubectl apply of the same manifest).
#
#   ./scripts/chaos-stop.sh pod-failure
#   ./scripts/chaos-stop.sh --all        # every experiment in the namespace
#
# Equivalent admin-dashboard action: press Stop on the running experiment —
# the ops-service deletes the same Chaos Mesh object.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ "${1:-}" = "--all" ]; then
  echo "==> deleting ALL chaos experiments in namespace ecommerce"
  kubectl -n ecommerce delete podchaos --all --ignore-not-found=true 2>/dev/null || true
  kubectl -n ecommerce delete networkchaos --all --ignore-not-found=true 2>/dev/null || true
  echo "==> all experiments removed"
  exit 0
fi

TYPE="${1:-pod-failure}"
case "$TYPE" in
  pod-failure|network-latency|service-outage) ;;
  *) echo "unknown type '$TYPE' (pod-failure | network-latency | service-outage)" >&2; exit 1 ;;
esac

MANIFEST="chaos/experiments/$TYPE.yaml"
if [ ! -f "$MANIFEST" ]; then
  echo "manifest not found: $MANIFEST" >&2
  exit 1
fi

echo "==> stopping $TYPE"
# Deleting by kind/name is robust even when the manifest was patched (name
# is immutable), so delete everything of the kind, then -f for good measure.
KIND="$( [ "$TYPE" = "pod-failure" ] && echo podchaos || echo networkchaos )"
kubectl -n ecommerce delete "$KIND" --all --ignore-not-found=true 2>/dev/null || true
kubectl delete -f "$MANIFEST" --ignore-not-found=true 2>/dev/null || true

echo "==> stopped. Verify: kubectl -n ecommerce get podchaos,networkchaos (should be empty)"
