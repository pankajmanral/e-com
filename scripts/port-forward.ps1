<#
.SYNOPSIS
  Starts kubectl port-forwards so the lab matches the local demo URLs.

.DESCRIPTION
  Forwards (one background kubectl process each):
    Jaeger UI        localhost:16686 -> svc/jaeger:16686            (ns observability)
    Prometheus       localhost:9090  -> svc/prometheus:9090         (ns observability)
    Grafana          localhost:3001  -> svc/grafana:3000            (ns observability)
    Frontend         localhost:3000  -> svc/frontend:3000           (ns ecommerce)
    ops-service API  localhost:4004  -> svc/ops-service:4004        (ns ecommerce)
    Ingressgateway   localhost:8080  -> svc/istio-ingressgateway:80 (ns istio-system)

  Runs until Ctrl+C, then kills every forward. Open a second terminal for
  kubectl while this stays alive.

.EXAMPLE
  scripts\port-forward.ps1
  scripts\port-forward.ps1 -SkipIngress
#>
[CmdletBinding()]
param(
    [switch]$SkipIngress,
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'

$forwards = @(
    @{ Name = 'jaeger';     Namespace = 'observability'; Service = 'jaeger';                 Local = 16686; Remote = 16686 }
    @{ Name = 'prometheus'; Namespace = 'observability'; Service = 'prometheus';             Local = 9090;  Remote = 9090 }
    @{ Name = 'grafana';    Namespace = 'observability'; Service = 'grafana';                Local = 3001;  Remote = 3000 }
)
if (-not $SkipFrontend) {
    $forwards += @{ Name = 'frontend';   Namespace = 'ecommerce';    Service = 'frontend';   Local = 3000;  Remote = 3000 }
    $forwards += @{ Name = 'ops-api';    Namespace = 'ecommerce';    Service = 'ops-service'; Local = 4004; Remote = 4004 }
}
if (-not $SkipIngress) {
    $forwards += @{ Name = 'ingress';    Namespace = 'istio-system'; Service = 'istio-ingressgateway'; Local = 8080; Remote = 80 }
}

$jobs = @()
try {
    foreach ($f in $forwards) {
        Write-Host ("==> {0,-10} http://localhost:{1}  ->  {2}/{3}:{4}" -f $f.Name, $f.Local, $f.Namespace, $f.Service, $f.Remote) -ForegroundColor Cyan
        $jobs += Start-Job -Name $f.Name -ScriptBlock {
            param($ns, $svc, $local, $remote)
            kubectl -n $ns port-forward "svc/$svc" "${local}:${remote}" 2>&1
        } -ArgumentList $f.Namespace, $f.Service, $f.Local, $f.Remote
    }

    Write-Host ""
    Write-Host "All forwards up. URLs for the demo:" -ForegroundColor Green
    Write-Host "  Storefront + admin   http://localhost:3000"
    Write-Host "  Grafana (dashboard)  http://localhost:3001   (Resilience Lab — Service RED Metrics)"
    Write-Host "  Jaeger UI            http://localhost:16686"
    Write-Host "  Prometheus           http://localhost:9090"
    Write-Host "  ops-service API      http://localhost:4004/api/ops"
    if (-not $SkipIngress) {
        Write-Host "  Istio ingressgateway http://localhost:8080   (edge routing for / and /api/*)"
    }
    Write-Host ""
    Write-Host "Press Ctrl+C to stop all forwards." -ForegroundColor Yellow

    # Wait until interrupted; surface any forward that dies early.
    while ($true) {
        Start-Sleep -Seconds 5
        foreach ($j in Get-Job) {
            if ($j.State -eq 'Completed' -or $j.State -eq 'Failed') {
                Write-Host ("port-forward '{0}' exited:" -f $j.Name) -ForegroundColor Red
                Receive-Job -Job $j | Write-Host
            }
        }
    }
} finally {
    Write-Host ""
    Write-Host "==> stopping port-forwards" -ForegroundColor Cyan
    Get-Job | Stop-Job -ErrorAction SilentlyContinue
    Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
}
