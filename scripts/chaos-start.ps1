<#
.SYNOPSIS
  Starts a Chaos Mesh experiment against the Resilience Lab (thin wrapper
  around kubectl apply of the canonical manifests in chaos/experiments/).

.DESCRIPTION
  Safety: refuses to run unless the current kubectl context matches the
  CHAOS_ALLOW_PATTERN (minikube|kind|desktop|docker-desktop|localhost) —
  the same guard the ops-service admin dashboard enforces. Bypass with
  -Force (don't).

  Equivalent admin-dashboard action: pick the same experiment + duration on
  the resilience admin page (http://localhost:3000/admin) — the ops-service
  applies this exact object through the Kubernetes API.

.EXAMPLE
  scripts\chaos-start.ps1 -Type pod-failure
  scripts\chaos-start.ps1 -Type network-latency -Service product-service -Duration 120s
#>
[CmdletBinding()]
param(
    # Which experiment (maps to chaos/experiments/<Type>.yaml).
    [ValidateSet('pod-failure', 'network-latency', 'service-outage')]
    [string]$Type = 'pod-failure',
    # App label to target (must run in the ecommerce namespace).
    [ValidateSet('product-service', 'user-service', 'order-service', 'ops-service')]
    [string]$Service = 'product-service',
    # How long Chaos Mesh runs it before auto-reverting.
    [ValidateSet('30s', '60s', '90s', '120s', '180s', '300s')]
    [string]$Duration = '60s',
    # Skip the kubectl-context safety check (lab users should not need this).
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Manifest = Join-Path $RepoRoot "chaos\experiments\$Type.yaml"

if (-not (Test-Path $Manifest)) {
    Write-Host "Manifest not found: $Manifest" -ForegroundColor Red
    exit 1
}

# --- safety rail: context allow-pattern (mirror of the ops-service guard) ---
$context = (& kubectl config current-context 2>$null)
if (-not $context) {
    Write-Host "No kubectl context — is the cluster running?" -ForegroundColor Red
    exit 1
}
$allowPattern = 'minikube|kind|desktop|docker-desktop|localhost'
if ($context -notmatch $allowPattern) {
    if (-not $Force) {
        Write-Host "REFUSING: kubectl context '$context' does not match '$allowPattern'." -ForegroundColor Red
        Write-Host "Chaos experiments only run against local lab clusters. Use -Force to override (don't)." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "WARNING: proceeding against context '$context' because of -Force." -ForegroundColor Yellow
}

# --- apply with parameter substitution --------------------------------------
# The canonical manifests hard-code product-service + a default duration;
# rewrite those two fields for the requested run via kubectl's server-side
# approach: patch after apply. Apply first, then patch duration/selector.
Write-Host "==> applying $Type (target app=$Service, duration=$Duration)" -ForegroundColor Cyan
& kubectl apply -f $Manifest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$kind = if ($Type -eq 'pod-failure') { 'podchaos' } else { 'networkchaos' }
$name = (Split-Path $Manifest -Leaf) -replace '\.yaml$', ''
# Canonical metadata.name values end with the experiment name.
$objects = & kubectl -n ecommerce get $kind -o name
$obj = $objects | Where-Object { $_ -match ($name -replace '-', '.*') } | Select-Object -First 1
if ($obj) {
    & kubectl -n ecommerce patch $obj --type merge -p "{`"spec`":{`"duration`":`"$Duration`",`"selector`":{`"labelSelectors`":{`"app`":`"$Service`"}}}}"
    if ($LASTEXITCODE -ne 0) { Write-Host "patch failed — running with the manifest's defaults" -ForegroundColor Yellow }
} else {
    Write-Host "Could not find the applied object to patch — check: kubectl -n ecommerce get $kind" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==> experiment running. Watch it with:" -ForegroundColor Green
Write-Host "   kubectl -n ecommerce get $kind -w"
Write-Host "Dashboard: http://localhost:3001 (Resilience Lab) — expected timeline in chaos\README.md"
Write-Host ""
Write-Host "Recover now:  scripts\chaos-stop.ps1 -Type $Type" -ForegroundColor Yellow
