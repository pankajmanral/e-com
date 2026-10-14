<#
.SYNOPSIS
  Stops a Chaos Mesh experiment started by scripts\chaos-start.ps1 (or the
  admin dashboard / a manual kubectl apply of the same manifest).

.DESCRIPTION
  Equivalent admin-dashboard action: press Stop on the running experiment —
  the ops-service deletes the same Chaos Mesh object.

.EXAMPLE
  scripts\chaos-stop.ps1 -Type pod-failure
  scripts\chaos-stop.ps1 -Type network-latency
  scripts\chaos-stop.ps1 -All        # nuke every experiment in the namespace
#>
[CmdletBinding()]
param(
    [ValidateSet('pod-failure', 'network-latency', 'service-outage')]
    [string]$Type = 'pod-failure',
    # Delete ALL chaos experiments in the ecommerce namespace regardless of type.
    [switch]$All
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($All) {
    Write-Host "==> deleting ALL chaos experiments in namespace ecommerce" -ForegroundColor Cyan
    & kubectl -n ecommerce delete podchaos --all --ignore-not-found=true
    & kubectl -n ecommerce delete networkchaos --all --ignore-not-found=true
    Write-Host "==> all experiments removed" -ForegroundColor Green
    exit 0
}

$Manifest = Join-Path $RepoRoot "chaos\experiments\$Type.yaml"
if (-not (Test-Path $Manifest)) {
    Write-Host "Manifest not found: $Manifest" -ForegroundColor Red
    exit 1
}

Write-Host "==> stopping $Type" -ForegroundColor Cyan
# kubectl delete by object-type + name is robust even when the manifest was
# patched (name is immutable), so first try deleting the known names, then
# fall back to -f for good measure.
$kind = if ($Type -eq 'pod-failure') { 'podchaos' } else { 'networkchaos' }
& kubectl -n ecommerce delete $kind --all --ignore-not-found=true
& kubectl delete -f $Manifest --ignore-not-found=true

Write-Host "==> stopped. Verify: kubectl -n ecommerce get podchaos,networkchaos (should be empty)" -ForegroundColor Green
