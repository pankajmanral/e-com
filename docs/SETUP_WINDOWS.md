# Windows Setup Guide

Everything in this project was developed and verified on Windows 11 (PowerShell 5.1 and 7),
with macOS/Linux equivalents for every script. Follow this page top-to-bottom the first time.

---

## 1. Core tooling (all run modes)

| Tool | Minimum | Check command | Install |
|------|---------|---------------|---------|
| Node.js | 20.10 (24 LTS tested) | `node -v` | [nodejs.com](https://nodejs.org) or `winget install OpenJS.NodeJS.LTS` |
| npm | 10+ | `npm -v` | ships with Node |
| Git | 2.x | `git --version` | `winget install Git.Git` |

### PowerShell execution policy

If you see *"`npm.ps1` cannot be loaded because running scripts is disabled"*:

```powershell
# option A: one-off for the current user (recommended)
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# option B: always call the .cmd shim (what the scripts in this repo do)
npm.cmd install
npm run dev
```

### Long file paths

npm's flat `node_modules` occasionally hits the 260-character limit:

```powershell
# as administrator
reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f
git config --system core.longpaths true
```

Then delete `node_modules` and re-run `npm install`.

---

## 2. Lightweight development mode

```powershell
git clone <repo-url> service-mesh-resilience-lab
cd service-mesh-resilience-lab
copy .env.example .env      # optional; sensible defaults are built in
npm install
npm run dev
```

Open <http://localhost:3000> (storefront), <http://localhost:3000/admin> (resilience dashboard).

Useful extras:

```powershell
npm run dev:services   # backend only (no Next.js)
npm test               # unit + API tests
npm run typecheck      # strict TS across the monorepo
npm run smoke          # end-to-end flow incl. a chaos experiment
```

Ports used: `3000` web, `4001-4004` services. If a port is busy:

```powershell
Get-NetTCPConnection -LocalPort 4001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 3. Docker Compose mode (adds Jaeger, Prometheus, Grafana, OTel collector)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) with the **WSL 2**
   backend.
2. Settings → Resources: give it at least **4 CPUs / 8 GB RAM / 20 GB disk**.
3. Start Docker Desktop and wait for the whale icon to say "running".

```powershell
docker compose up -d --build
docker compose ps
```

| UI | URL |
|----|-----|
| Storefront | http://localhost:3000 |
| Admin dashboard | http://localhost:3000/admin |
| Jaeger | http://localhost:16686 |
| Prometheus | http://localhost:9090 |
| Grafana (anonymous admin enabled) | http://localhost:3001 |

Follow logs with `docker compose logs -f user product order ops`, stop with `docker compose down`
(add `-v` to wipe Prometheus/Grafana data).

---

## 4. Full mesh lab (Minikube + Istio + Chaos Mesh)

Install the extra tools (or run the automated checker `scripts/setup-windows.ps1`):

```powershell
winget install Kubernetes.kubectl
winget install Kubernetes.minikube
winget install Helm.Helm
# istioctl: download from https://istio.io/latest/docs/setup/getting-tool-and-downloads/
# and put istioctl.exe on your PATH
```

Size Docker Desktop for the cluster (4 CPU / 8 GB) and then:

```powershell
minikube start --cpus=4 --memory=8192 --driver=docker
minikube addons enable metrics-server
istioctl install -y                                   # Istio with default profile
scripts/k8s-build-load.ps1                            # build images, load into minikube
scripts/k8s-deploy.ps1                                # namespaces → observability → apps → Istio
scripts/port-forward.ps1                              # Jaeger/Prometheus/Grafana/web on local ports
```

Chaos Mesh (one-time, as documented in `docs/INFRA.md`):

```powershell
helm repo add chaos-mesh https://chaos-mesh.github.io/chaos-mesh
helm repo update
helm install chaos-mesh chaos-mesh/chaos-mesh -n chaos-mesh --create-namespace `
  --set chaosDaemon.runtime=containerd --set chaosDaemon.socketPath=/run/containerd/containerd.sock `
  --set dashboards.create=true --set prometheus.create=false
kubectl get pods -n chaos-mesh
```

Verify the lab:

```powershell
kubectl get pods -n ecommerce -o wide          # every pod should have 2/2 containers (sidecar)
kubectl get virtualservices,gateway -n ecommerce
istioctl proxy-status
```

Teardown: `scripts/k8s-teardown.ps1` (add `-All` to delete the minikube cluster).

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `npm install` fails with EPERM / EBUSY | Close editors/antivirus scans of the folder, `rd /s /q node_modules`, retry |
| Pods stay `1/1` without a sidecar | Namespace label missing: `kubectl label namespace ecommerce istio-injection=enabled --overwrite`, then restart pods |
| `ImagePullBackOff` after building | Images live in Minikube's docker daemon — use `scripts/k8s-build-load.ps1`, not plain `docker build` |
| Grafana shows "No data" | Prometheus cannot reach the services: check `kubectl exec -n observability deploy/prometheus -- wget -qO- http://user-service.ecommerce.svc.cluster.local:4001/metrics` |
| No traces in Jaeger | Services must set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_TRACES_EXPORTER=otlp` (compose/k8s ConfigMaps do this); the lightweight dev mode intentionally exports nothing |
| Chaos start returns 403 | By design: set `CHAOS_ENABLED=true`, `CHAOS_MODE=local` (or `k8s`), and make sure your kubectl context is a local cluster |
| Port-forward dies on sleep | Re-run `scripts/port-forward.ps1`; keep the window open |
