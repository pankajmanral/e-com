<#
.SYNOPSIS
  Ordered deployment of the full Resilience Lab into Minikube.

.DESCRIPTION
  Apply order (dependencies first):
    1. namespaces (ecommerce, observability)
    2. shared config (+ secrets.yaml when present)
    3. observability stack (collector, jaeger, prometheus, grafana)
    4. application manifests (SA/PDB/Deployment/Service per service)
    5. istio routing + resilience policy (gateway, destination rules,
       virtual services)
    6. kubectl rollout status waits, then prints access instructions.

.EXAMPLE
  scripts\k8s-deploy.ps1
  scripts\k8s-deploy.ps1 -SkipObservability      # apps only
  scripts\k8s-deploy.ps1 -Tag 1.1.0              # deploy a different image tag
#>
[CmdletBinding()]
param(
    [switch]$SkipObservability,
    # Image tag applied to the app Deployments (must match k8s-build-load).
    [string]$Tag = '1.0.0'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}
function Invoke-Kubectl {
    param([string[]]$KubectlArgs, [string]$FailureMessage)
    & kubectl @KubectlArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "$FailureMessage (kubectl $($KubectlArgs -join ' '))" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Push-Location $RepoRoot
try {
    Write-Step "1/6 namespaces"
    Invoke-Kubectl @('apply', '-f', 'k8s/namespace.yaml') 'namespace apply failed'
    Invoke-Kubectl @('apply', '-f', 'k8s/observability/namespace.yaml') 'observability namespace apply failed'

    Write-Step "2/6 shared config (+ secrets when present)"
    Invoke-Kubectl @('apply', '-f', 'k8s/configmap.yaml') 'configmap apply failed'
    if (Test-Path 'k8s/secrets.yaml') {
        Invoke-Kubectl @('apply', '-f', 'k8s/secrets.yaml') 'secrets apply failed'
    } else {
        Write-Host "    k8s/secrets.yaml not found — using defaults (copy k8s/secret.example.yaml to override)" -ForegroundColor Yellow
    }

    if ($SkipObservability) {
        Write-Step "3/6 observability SKIPPED (-SkipObservability)"
    } else {
        Write-Step "3/6 observability stack"
        Invoke-Kubectl @('apply', '-f', 'k8s/observability/otel-collector.yaml') 'otel-collector apply failed'
        Invoke-Kubectl @('apply', '-f', 'k8s/observability/jaeger.yaml') 'jaeger apply failed'
        Invoke-Kubectl @('apply', '-f', 'k8s/observability/prometheus.yaml') 'prometheus apply failed'
        Invoke-Kubectl @('apply', '-f', 'k8s/observability/grafana-dashboard.yaml') 'grafana dashboard apply failed'
        Invoke-Kubectl @('apply', '-f', 'k8s/observability/grafana.yaml') 'grafana apply failed'
    }

    Write-Step "4/6 application manifests (tag $Tag)"
    # Image tags are baked into the manifests as ecommerce/<svc>:1.0.0; when a
    # custom -Tag is given, patch the Deployment images after applying.
    foreach ($file in 'k8s/user-service.yaml', 'k8s/product-service.yaml', 'k8s/order-service.yaml', 'k8s/ops-service.yaml', 'k8s/frontend.yaml') {
        Invoke-Kubectl @('apply', '-f', $file) "$file apply failed"
    }
    if ($Tag -ne '1.0.0') {
        foreach ($deploy in 'user-service', 'product-service', 'order-service', 'ops-service') {
            Invoke-Kubectl @('-n', 'ecommerce', 'set', 'image', "deploy/$deploy", "$deploy=ecommerce/${deploy}:$Tag") "image patch failed for $deploy"
        }
        Invoke-Kubectl @('-n', 'ecommerce', 'set', 'image', 'deploy/frontend', "frontend=ecommerce/web:$Tag") 'image patch failed for frontend'
    }

    Write-Step "5/6 istio routing + resilience policy"
    Invoke-Kubectl @('apply', '-f', 'k8s/istio/gateway.yaml') 'gateway apply failed'
    Invoke-Kubectl @('apply', '-f', 'k8s/istio/destination-rules.yaml') 'destination rules apply failed'
    Invoke-Kubectl @('apply', '-f', 'k8s/istio/virtual-services.yaml') 'virtual services apply failed'

    Write-Step "6/6 waiting for rollouts"
    if (-not $SkipObservability) {
        foreach ($deploy in 'otel-collector', 'jaeger', 'prometheus', 'grafana') {
            & kubectl -n observability rollout status "deploy/$deploy" --timeout=180s
            if ($LASTEXITCODE -ne 0) {
                Write-Host "rollout of $deploy did not complete; check: kubectl -n observability get pods" -ForegroundColor Red
                exit $LASTEXITCODE
            }
        }
    }
    foreach ($deploy in 'user-service', 'product-service', 'order-service', 'ops-service', 'frontend') {
        & kubectl -n ecommerce rollout status "deploy/$deploy" --timeout=180s
        if ($LASTEXITCODE -ne 0) {
            Write-Host "rollout of $deploy did not complete; check: kubectl -n ecommerce get pods" -ForegroundColor Red
            Write-Host "If pods show 1/2 with istio-proxy Error, restart after injection:" -ForegroundColor Yellow
            Write-Host "  kubectl -n ecommerce rollout restart deploy" -ForegroundColor Yellow
            exit $LASTEXITCODE
        }
    }

    Write-Host ""
    Write-Host "==> lab deployed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify:      kubectl get pods -n ecommerce        (expect 2/2 per pod)" -ForegroundColor White
    Write-Host "             kubectl get pods -n observability" -ForegroundColor White
    Write-Host "Access:      scripts\port-forward.ps1  (Jaeger/Prometheus/Grafana/frontend)" -ForegroundColor White
    Write-Host "Ingress:     minikube ip  ->  http://<ip>/   (Istio ingressgateway :80)" -ForegroundColor White
    Write-Host "Chaos demo:  scripts\chaos-start.ps1 -Type pod-failure -Service product-service -Duration 60s" -ForegroundColor White
    Write-Host "             full walkthrough: chaos\manual-demo.md" -ForegroundColor White
} finally {
    Pop-Location
}
