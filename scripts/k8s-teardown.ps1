<#
.SYNOPSIS
  Tears the Resilience Lab down, in reverse dependency order.

.DESCRIPTION
  Default: remove chaos experiments, Istio routing, app manifests,
  observability, then the ecommerce/observability namespaces.
  -All additionally deletes the minikube cluster itself.

.EXAMPLE
  scripts\k8s-teardown.ps1
  scripts\k8s-teardown.ps1 -All          # also `minikube delete`
  scripts\k8s-teardown.ps1 -KeepObservability
#>
[CmdletBinding()]
param(
    # Also delete the whole minikube cluster at the end.
    [switch]$All,
    # Leave the observability namespace (and Chaos Mesh) running.
    [switch]$KeepObservability
)

$ErrorActionPreference = 'Continue'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

Push-Location $RepoRoot
try {
    Write-Step "removing chaos experiments (must go first — they target live pods)"
    & kubectl -n ecommerce delete podchaos --all --ignore-not-found=true 2>$null | Out-Null
    & kubectl -n ecommerce delete networkchaos --all --ignore-not-found=true 2>$null | Out-Null
    & kubectl delete -f chaos/experiments --ignore-not-found=true 2>$null | Out-Null

    Write-Step "removing istio routing + resilience policy"
    & kubectl delete -f k8s/istio/virtual-services.yaml --ignore-not-found=true 2>$null | Out-Null
    & kubectl delete -f k8s/istio/destination-rules.yaml --ignore-not-found=true 2>$null | Out-Null
    & kubectl delete -f k8s/istio/gateway.yaml --ignore-not-found=true 2>$null | Out-Null
    # The ops-service applies fault-injection VirtualServices dynamically —
    # clean up any leftovers by name.
    & kubectl -n ecommerce delete virtualservice product-service-fault-injection --ignore-not-found=true 2>$null | Out-Null

    Write-Step "removing application manifests"
    & kubectl delete -f k8s/product-service-v2.yaml --ignore-not-found=true 2>$null | Out-Null
    foreach ($file in 'k8s/frontend.yaml', 'k8s/ops-service.yaml', 'k8s/order-service.yaml', 'k8s/product-service.yaml', 'k8s/user-service.yaml') {
        & kubectl delete -f $file --ignore-not-found=true 2>$null | Out-Null
    }
    & kubectl delete -f k8s/secret.example.yaml --ignore-not-found=true 2>$null | Out-Null
    & kubectl delete -f k8s/configmap.yaml --ignore-not-found=true 2>$null | Out-Null

    if ($KeepObservability) {
        Write-Step "keeping observability (-KeepObservability)"
    } else {
        Write-Step "removing observability stack"
        foreach ($file in 'k8s/observability/grafana.yaml', 'k8s/observability/prometheus.yaml', 'k8s/observability/jaeger.yaml', 'k8s/observability/otel-collector.yaml', 'k8s/observability/grafana-dashboard.yaml') {
            & kubectl delete -f $file --ignore-not-found=true 2>$null | Out-Null
        }
        Write-Step "removing observability namespace"
        & kubectl delete namespace observability --ignore-not-found=true --timeout=120s 2>$null | Out-Null
    }

    Write-Step "removing ecommerce namespace"
    & kubectl delete namespace ecommerce --ignore-not-found=true --timeout=120s 2>$null | Out-Null

    if ($All) {
        Write-Step "deleting the minikube cluster (-All)"
        & minikube delete
        if ($LASTEXITCODE -ne 0) { Write-Host "minikube delete failed — is it installed/running?" -ForegroundColor Yellow }
    } else {
        Write-Host ""
        Write-Host "Cluster left running. To delete it:  scripts\k8s-teardown.ps1 -All" -ForegroundColor Yellow
        Write-Host "To redeploy:                        scripts\k8s-deploy.ps1" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "==> teardown complete" -ForegroundColor Green
} finally {
    Pop-Location
}
