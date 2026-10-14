#!/usr/bin/env bash
# Prerequisite checker for the Resilience Lab (Linux/macOS/bash).
# Checks node, npm, docker, kubectl, minikube, istioctl and helm; prints the
# installed version or install guidance for anything missing. Runs
# `npm install` at the repo root when node_modules is absent.
#
#   ./scripts/setup-windows.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MISSING=0

check() {
  local name="$1" hint="$2" version_cmd="$3"
  if command -v "$name" >/dev/null 2>&1; then
    local version
    version="$($version_cmd 2>/dev/null | head -n 1)"
    printf '%-12s OK       %s\n' "$name" "$version"
  else
    printf '%-12s MISSING  %s\n' "$name" "$hint"
    MISSING=$((MISSING + 1))
  fi
}

echo "==> Resilience Lab — prerequisite check"

# --- language ---------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  NV="$(node --version)"
  MAJOR="${NV#v}"; MAJOR="${MAJOR%%.*}"
  if [ "$MAJOR" -ge 20 ]; then
    printf '%-12s OK       %s\n' "node" "$NV"
  else
    printf '%-12s TOO OLD  %s — need >= 20 (https://nodejs.org)\n' "node" "$NV"
    MISSING=$((MISSING + 1))
  fi
else
  printf '%-12s MISSING  https://nodejs.org (LTS >= 20)\n' "node"
  MISSING=$((MISSING + 1))
fi
check npm 'comes with node — reinstall node' 'npm --version'

# --- container + cluster tooling -------------------------------------------
check docker 'Install Docker Desktop: https://docs.docker.com/desktop/setup/install/' 'docker --version'
check kubectl 'https://kubernetes.io/docs/tasks/tools/' 'kubectl version --client'
check minikube 'https://minikube.sigs.k8s.io/docs/start/' 'minikube version'
check istioctl 'https://istio.io/latest/docs/setup/getting-started/#download' 'istioctl version'
check helm 'https://helm.sh/docs/intro/install/' 'helm version --short'

# --- docker daemon ----------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    echo "docker         daemon not running — start Docker Desktop / dockerd"
  fi
fi

# --- npm install ------------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "==> node_modules missing — running npm install at the repo root"
  npm install --no-audit --no-fund || exit 1
else
  echo "node_modules present — skipping npm install."
fi

echo ""
echo "Next steps:"
echo "  Lightweight demo:  ./scripts/dev.sh"
echo "  Full mesh lab:     minikube start --cpus 4 --memory 8192 --driver docker   (see k8s/README.md)"
exit 0
