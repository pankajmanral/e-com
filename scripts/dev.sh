#!/usr/bin/env bash
# Local lightweight mode — runs the whole app on the host with npm workspaces.
# Checks Node >= 20, builds the shared library, then starts the four services
# + the Next.js frontend via the root `npm run dev` (concurrently).
#
#   ./scripts/dev.sh
#   ./scripts/dev.sh --skip-build
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKIP_BUILD=false
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=true

echo "==> Service-Mesh Resilience Lab — dev mode"

# --- node version gate ------------------------------------------------------
NODE_VERSION="$(node --version)"
echo "==> node $NODE_VERSION"
if ! printf '%s' "$NODE_VERSION" | grep -Eq '^v([2-9][0-9]|[3-9][0-9])\.'; then
  echo "Node >= 20 required (found $NODE_VERSION). Install from https://nodejs.org" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "node_modules missing — run ./scripts/setup-windows.sh first (or npm install at the repo root)." >&2
  exit 1
fi

# --- build shared -----------------------------------------------------------
if [[ "$SKIP_BUILD" == false ]]; then
  echo "==> building @ecommerce/shared"
  # --declaration: packages/shared advertises dist/index.d.ts types; pass the
  # flag until packages/shared/tsconfig.json sets declaration:true.
  npm run build -w @ecommerce/shared -- --declaration
fi

# --- run everything ---------------------------------------------------------
echo "==> starting user, product, order, ops + web (Ctrl+C stops all)"
cat <<'URLS'

  Storefront        http://localhost:3000
  user-service      http://localhost:4001/api/users
  product-service   http://localhost:4002/api/products
  order-service     http://localhost:4003/api/orders
  ops-service       http://localhost:4004/api/ops

URLS

npm run dev
