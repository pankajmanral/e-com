<#
.SYNOPSIS
  Builds the five lab images and loads them into Minikube.

.DESCRIPTION
  For each of user/product/order/ops/web:
    1. docker build -f <svc>/Dockerfile -t ecommerce/<svc>:<tag> .   (repo root context)
    2. minikube image load ecommerce/<svc>:<tag>
  Loading is required because Minikube's containerd cannot see images that
  only exist in the host Docker daemon. Alternatively use
  `minikube image build` directly (builds inside the cluster VM) — see the
  -UseClusterBuild switch.

.EXAMPLE
  scripts\k8s-build-load.ps1
  scripts\k8s-build-load.ps1 -Tag 1.1.0 -Only product-service
#>
[CmdletBinding()]
param(
    [string]$Tag = '1.0.0',
    # Build only these services (default: all five).
    [string[]]$Only = @('user-service', 'product-service', 'order-service', 'ops-service', 'web'),
    # Build inside Minikube instead of docker build + image load.
    [switch]$UseClusterBuild
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Write-Status([string]$Message, [string]$Color = 'Cyan') {
    Write-Host "==> $Message" -ForegroundColor $Color
}

# Map service name -> Dockerfile (build context is always the repo root).
$dockerfiles = @{
    'user-service'    = 'services/user-service/Dockerfile'
    'product-service' = 'services/product-service/Dockerfile'
    'order-service'   = 'services/order-service/Dockerfile'
    'ops-service'     = 'services/ops-service/Dockerfile'
    'web'             = 'apps/web/Dockerfile'
}

# minikube must be running for image load (skip the check for cluster build?).
Write-Status "checking minikube"
& minikube status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "minikube is not running. Start it first:" -ForegroundColor Red
    Write-Host "  minikube start --cpus 4 --memory 8192 --driver docker" -ForegroundColor Yellow
    exit 1
}

foreach ($svc in $Only) {
    if (-not $dockerfiles.ContainsKey($svc)) {
        Write-Host "Unknown service '$svc'. Known: $($dockerfiles.Keys -join ', ')" -ForegroundColor Red
        exit 1
    }
    $dockerfile = $dockerfiles[$svc]
    $image = "ecommerce/${svc}:${Tag}"

    Write-Status "building $image  ($dockerfile)"
    Push-Location $RepoRoot
    try {
        if ($UseClusterBuild) {
            # Build inside the cluster VM — no separate load step needed.
            & minikube image build -f $dockerfile -t $image .
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        } else {
            & docker build -f $dockerfile -t $image .
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

            Write-Status "loading $image into minikube" 'Yellow'
            & minikube image load $image
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
    } finally {
        Pop-Location
    }
    Write-Host "    $image done" -ForegroundColor Green
}

Write-Status "verifying images inside minikube" 'Magenta'
& minikube image ls | Select-String 'ecommerce/'
Write-Host ""
Write-Host "Next: scripts\k8s-deploy.ps1" -ForegroundColor Cyan
