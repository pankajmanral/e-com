<#
.SYNOPSIS
  Prerequisite checker/installer for the Resilience Lab (Windows).

.DESCRIPTION
  Checks node, npm, docker, kubectl, minikube, istioctl and helm; prints the
  installed version or install guidance for anything missing. With -Install
  it uses winget for kubectl/minikube/helm, and runs `npm install` at the
  repo root when node_modules is absent.

.EXAMPLE
  scripts\setup-windows.ps1            # check only
  scripts\setup-windows.ps1 -Install   # install what's missing
#>
[CmdletBinding()]
param(
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$script:Missing = @()

function Test-Tool {
    param(
        [string]$Name,
        [string]$VersionArgs = '--version',
        [string]$InstallHint,
        [string]$WingetId
    )
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        Write-Host ("{0,-12} MISSING  {1}" -f $Name, $InstallHint) -ForegroundColor Red
        $script:Missing += [pscustomobject]@{ Name = $Name; Hint = $InstallHint; WingetId = $WingetId }
        return
    }
    try {
        $version = (& $Name @($VersionArgs.Split(' ')) 2>$null | Select-Object -First 1)
    } catch {
        $version = '(version probe failed)'
    }
    Write-Host ("{0,-12} OK       {1}" -f $Name, $version) -ForegroundColor Green
}

Write-Host "==> Resilience Lab — prerequisite check" -ForegroundColor Cyan

# --- languages --------------------------------------------------------------
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nv = & node --version
    $major = 0
    if ($nv -match '^v(\d+)\.') { $major = [int]$Matches[1] }
    if ($major -ge 20) {
        Write-Host ("{0,-12} OK       {1}" -f 'node', $nv) -ForegroundColor Green
    } else {
        Write-Host ("{0,-12} TOO OLD  {1} — need >= 20 (https://nodejs.org)" -f 'node', $nv) -ForegroundColor Red
        $script:Missing += [pscustomobject]@{ Name = 'node'; Hint = 'https://nodejs.org (LTS >= 20)'; WingetId = 'OpenJS.NodeJS.LTS' }
    }
} else {
    Write-Host ("{0,-12} MISSING  https://nodejs.org (LTS >= 20)" -f 'node') -ForegroundColor Red
    $script:Missing += [pscustomobject]@{ Name = 'node'; Hint = 'https://nodejs.org (LTS >= 20)'; WingetId = 'OpenJS.NodeJS.LTS' }
}
# npm ships with node; probe the .cmd shim (PowerShell execution policy can
# block npm.ps1, so npm.cmd is what our scripts invoke anyway).
if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    Write-Host ("{0,-12} OK       {1}" -f 'npm', (& npm.cmd --version)) -ForegroundColor Green
} else {
    Write-Host ("{0,-12} MISSING  comes with node — reinstall node" -f 'npm') -ForegroundColor Red
}

# --- container + cluster tooling -------------------------------------------
Test-Tool -Name 'docker' -VersionArgs '--version' `
    -InstallHint 'Install Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/' -WingetId 'Docker.DockerDesktop'
Test-Tool -Name 'kubectl' -VersionArgs 'version --client' `
    -InstallHint 'https://kubernetes.io/docs/tasks/tools/' -WingetId 'Kubernetes.kubectl'
Test-Tool -Name 'minikube' -VersionArgs 'version' `
    -InstallHint 'https://minikube.sigs.k8s.io/docs/start/' -WingetId 'Google.Minikube'
Test-Tool -Name 'istioctl' -VersionArgs 'version' `
    -InstallHint 'https://istio.io/latest/docs/setup/getting-started/#download' -WingetId $null
Test-Tool -Name 'helm' -VersionArgs 'version' `
    -InstallHint 'https://helm.sh/docs/intro/install/' -WingetId 'Helm.Helm'

# --- docker daemon reachable? ------------------------------------------------
$dockerUp = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    try { docker info 2>$null | Out-Null; $dockerUp = ($LASTEXITCODE -eq 0) } catch { $dockerUp = $false }
}
if (-not $dockerUp -and (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "docker         daemon not running — start Docker Desktop" -ForegroundColor Yellow
}

# --- install missing via winget --------------------------------------------
if ($Install -and $script:Missing.Count -gt 0) {
    foreach ($m in $script:Missing) {
        if ($m.WingetId) {
            Write-Host "==> winget install $($m.WingetId)" -ForegroundColor Cyan
            winget install --id $m.WingetId -e --accept-source-agreements --accept-package-agreements
        } else {
            Write-Host "==> $($m.Name) has no winget id; follow: $($m.Hint)" -ForegroundColor Yellow
        }
    }
    Write-Host "==> istioctl has no winget id; install manually:" -ForegroundColor Yellow
    Write-Host "    istioctl via: Invoke-WebRequest -Uri https://istio.io/downloadIstio | Iex" -ForegroundColor Yellow
} elseif ($script:Missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Missing tools detected. Re-run with -Install to install via winget," -ForegroundColor Yellow
    "or install manually using the links above."
}

# --- npm install at repo root if needed -------------------------------------
if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
    Write-Host "==> node_modules missing — running npm install at the repo root" -ForegroundColor Cyan
    Push-Location $RepoRoot
    try { & npm.cmd install --no-audit --no-fund } finally { Pop-Location }
} else {
    Write-Host "node_modules present — skipping npm install." -ForegroundColor Green
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  Lightweight demo:  scripts\dev.ps1"
Write-Host "  Full mesh lab:     minikube start --cpus 4 --memory 8192 --driver docker   (see k8s\README.md)"
exit 0
