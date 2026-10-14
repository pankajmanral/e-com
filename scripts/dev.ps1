<#
.SYNOPSIS
  Local lightweight mode — runs the whole app on the host with npm workspaces.

.DESCRIPTION
  Checks Node >= 20, builds the shared library, then starts the four
  services + the Next.js frontend via the root `npm run dev` script
  (concurrently). No Docker, no cluster; observability is optional:
  leave OTEL_EXPORTER_OTLP_ENDPOINT empty (default) to skip tracing export.

.EXAMPLE
  scripts\dev.ps1
  scripts\dev.ps1 -SkipBuild
#>
[CmdletBinding()]
param(
    # Skip the shared-package build (use when dist is already current).
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

# Always operate from the repo root regardless of the caller's cwd.
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

function Write-Status([string]$Message, [string]$Color = 'Cyan') {
    Write-Host "==> $Message" -ForegroundColor $Color
}

Write-Status "Service-Mesh Resilience Lab — dev mode"

# --- node version gate ------------------------------------------------------
$nodeVersion = & node --version
Write-Status "node $nodeVersion"
if ($nodeVersion -notmatch '^v(2\d|([3-9]\d))\.') {
    Write-Host "Node >= 20 required (found $nodeVersion). Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
    Write-Host "node_modules missing — run scripts\setup-windows.ps1 first (or npm install at the repo root)." -ForegroundColor Red
    exit 1
}

# --- build shared -----------------------------------------------------------
if (-not $SkipBuild) {
    Write-Status "building @ecommerce/shared"
    # --declaration: packages/shared advertises dist/index.d.ts types; pass
    # the flag until packages/shared/tsconfig.json sets declaration:true.
    & npm.cmd run build -w '@ecommerce/shared' -- --declaration
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# --- run everything ---------------------------------------------------------
Write-Status "starting user, product, order, ops + web (Ctrl+C stops all)" 'Magenta'
Write-Host ""
Write-Host "  Storefront        http://localhost:3000" -ForegroundColor Green
Write-Host "  user-service      http://localhost:4001/api/users" -ForegroundColor Green
Write-Host "  product-service   http://localhost:4002/api/products" -ForegroundColor Green
Write-Host "  order-service     http://localhost:4003/api/orders" -ForegroundColor Green
Write-Host "  ops-service       http://localhost:4004/api/ops" -ForegroundColor Green
Write-Host ""

& npm.cmd run dev
exit $LASTEXITCODE
