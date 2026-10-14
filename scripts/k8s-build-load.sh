#!/usr/bin/env bash
# Builds the five lab images and loads them into Minikube.
#
#   ./scripts/k8s-build-load.sh                 # all five
#   ./scripts/k8s-build-load.sh 1.1.0           # custom tag
#   TAG=1.1.0 ONLY="product-service web" ./scripts/k8s-build-load.sh
#
# Loading is required because Minikube's containerd cannot see images that
# only exist in the host Docker daemon.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TAG="${1:-${TAG:-1.0.0}}"
ONLY="${ONLY:-user-service product-service order-service ops-service web}"

dockerfile_for() {
  case "$1" in
    user-service)    echo services/user-service/Dockerfile ;;
    product-service) echo services/product-service/Dockerfile ;;
    order-service)   echo services/order-service/Dockerfile ;;
    ops-service)     echo services/ops-service/Dockerfile ;;
    web)             echo apps/web/Dockerfile ;;
    *) echo "unknown service '$1'" >&2; exit 1 ;;
  esac
}

echo "==> checking minikube"
if ! minikube status >/dev/null 2>&1; then
  echo "minikube is not running. Start it first:" >&2
  echo "  minikube start --cpus 4 --memory 8192 --driver docker" >&2
  exit 1
fi

for svc in $ONLY; do
  dockerfile="$(dockerfile_for "$svc")"
  image="ecommerce/${svc}:${TAG}"

  echo "==> building $image  ($dockerfile)"
  docker build -f "$dockerfile" -t "$image" .

  echo "==> loading $image into minikube"
  minikube image load "$image"

  echo "    $image done"
done

echo "==> verifying images inside minikube"
minikube image ls | grep 'ecommerce/' || true
echo ""
echo "Next: ./scripts/k8s-deploy.sh"
