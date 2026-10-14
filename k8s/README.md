# Kubernetes + Istio — deploying the Resilience Lab

Everything below targets **Minikube** (the lab's reference cluster). Adapt
`minikube` commands for kind/Docker Desktop; only the image-loading step
differs.

## 0. Prerequisites

```powershell
# Windows (checks/installs everything via winget)
scripts/setup-windows.ps1 -Install
# Linux/macOS
./scripts/setup-windows.sh
```

You need: Node >= 20, Docker Desktop running, kubectl, minikube, istioctl,
helm. Resource budget: **4 CPUs / 8-10 GB RAM free** for the Minikube VM.

## 1. Cluster + Istio + Chaos Mesh

```powershell
# 1a. Start the cluster (docker driver keeps it on the Docker Desktop VM)
minikube start --cpus 4 --memory 8192 --driver docker

# 1b. metrics-server for kubectl top / HPA demos
minikube addons enable metrics-server

# 1c. Istio (demo profile installs ingressgateway + Kiali; default profile
#     is enough for this lab — only ingressgateway is required)
istioctl install -y --set profile=demo

# 1d. Chaos Mesh (CRDs + controller + dashboard)
helm repo add chaos-mesh https://chaos-mesh.github.io/chaos-mesh
helm repo update
helm install chaos-mesh chaos-mesh/chaos-mesh -n chaos-mesh --create-namespace `
  --set chaosDaemon.runtime=containerd `
  --set chaosDaemon.socketPath=/run/containerd/containerd.sock `
  --set dashboards.create=true `
  --set prometheus.create=false
```

Verify: `kubectl get pods -n istio-system` (istiod + istio-ingressgateway
Running) and `kubectl get pods -n chaos-mesh` (chaos-controller + chaos-daemon).

## 2. Namespaces and shared config

```powershell
kubectl apply -f k8s/namespace.yaml          # ecommerce (istio-injection=enabled)
kubectl apply -f k8s/observability/namespace.yaml
kubectl apply -f k8s/configmap.yaml          # shared env for every service
# Optional secrets (Grafana admin override) — file is git-ignored:
Copy-Item k8s\secret.example.yaml k8s\secrets.yaml   # edit values first!
kubectl apply -f k8s\secrets.yaml            # or skip; defaults are fine for the lab
```

## 3. Observability stack (before the apps, so traces have a home)

```powershell
kubectl apply -f k8s/observability/otel-collector.yaml
kubectl apply -f k8s/observability/jaeger.yaml
kubectl apply -f k8s/observability/prometheus.yaml
kubectl apply -f k8s/observability/grafana-dashboard.yaml   # GENERATED — see below
kubectl apply -f k8s/observability/grafana.yaml
kubectl -n observability rollout status deploy/otel-collector deploy/jaeger deploy/prometheus deploy/grafana
```

> `grafana-dashboard.yaml` is generated from
> `observability/grafana/dashboards/resilience-lab.json`; regenerate with
> `node scripts/gen-dashboard-configmap.mjs` after editing the JSON.

## 4. Build + load the app images

Minikube's container runtime cannot see images built on the host — you must
load them explicitly (this is the #1 lab failure, see Troubleshooting):

```powershell
scripts/k8s-build-load.ps1            # builds all 5 images and loads them
# equivalent single command per service:
#   minikube image build -f services/user-service/Dockerfile -t ecommerce/user-service:1.0.0 .
```

## 5. Application manifests

```powershell
scripts/k8s-deploy.ps1                # ordered apply + rollout waits
# or manually, in this order:
kubectl apply -f k8s/user-service.yaml      # SA + PDB + Deployment(2) + Service
kubectl apply -f k8s/product-service.yaml
kubectl apply -f k8s/order-service.yaml     # incl. emptyDir for orders.json
kubectl apply -f k8s/ops-service.yaml       # incl. Role/RoleBinding for chaos
kubectl apply -f k8s/frontend.yaml
kubectl -n ecommerce rollout status deploy/user-service deploy/product-service deploy/order-service deploy/ops-service deploy/frontend
```

Optional canary demo: `kubectl apply -f k8s/product-service-v2.yaml`
(1 replica, `version=v2`, `PRODUCT_VERSION=v2`; enable the commented 90/10
VirtualService in that file to split traffic via Istio).

## 6. Istio routing + resilience policy

```powershell
kubectl apply -f k8s/istio/gateway.yaml            # Gateway + edge routes
kubectl apply -f k8s/istio/destination-rules.yaml # circuit breakers
kubectl apply -f k8s/istio/virtual-services.yaml  # timeouts + retries
```

## 7. Verify

```powershell
kubectl get pods -n ecommerce        # expect 2/2 per pod: app + istio-proxy
kubectl get pods -n observability
kubectl get gateway,virtualservice,destinationrule -n ecommerce
kubectl get podchaos,networkchaos -n ecommerce   # empty until you run chaos
```

`2/2 Ready` is the health signal that includes the sidecar. `1/2` with
`istio-proxy` Error means injection or the app start order went wrong — see
Troubleshooting.

## 8. Access URLs

| What | How |
|------|-----|
| Storefront + admin | `scripts/port-forward.ps1` → http://localhost:3000 (or `minikube service frontend -n ecommerce --url`) |
| Ingress (Gateway) | `minikube ip` → http://<ip>/ (port 80 on the ingressgateway) |
| Jaeger UI | port-forward → http://localhost:16686 |
| Prometheus | port-forward → http://localhost:9090 |
| Grafana | port-forward → http://localhost:3001 (dashboard "Resilience Lab — Service RED Metrics") |
| Chaos Mesh dashboard | `kubectl -n chaos-mesh port-forward svc/chaos-dashboard 2333:2333` → http://localhost:2333 |
| ops-service | port-forward → http://localhost:4004/api/ops |

`scripts/port-forward.ps1` starts all four forwards in one window and keeps
them alive until Ctrl+C.

NodePort alternative for demos (no port-forward processes to babysit):

```powershell
kubectl -n observability patch svc grafana -p '{"spec":{"type":"NodePort","ports":[{"port":3000,"nodePort":30300}]}}'
kubectl -n observability patch svc jaeger  -p '{"spec":{"type":"NodePort","ports":[{"port":16686,"nodePort":31686}]}}'
kubectl -n observability patch svc prometheus -p '{"spec":{"type":"NodePort","ports":[{"port":9090,"nodePort":30090}]}}'
```

## 9. Run a chaos experiment

```powershell
scripts/chaos-start.ps1 -Type pod-failure -Service product-service -Duration 60s
# watch: kubectl get podchaos -n ecommerce -w
scripts/chaos-stop.ps1 -Type pod-failure
```

Full demo script: `chaos/manual-demo.md`. Manifests: `chaos/experiments/`
(canonical; `k8s/chaos/*.yaml` are pointer stubs).

## 10. Cleanup order

```powershell
scripts/k8s-teardown.ps1              # istio routing → apps → observability → namespaces
scripts/k8s-teardown.ps1 -All         # ...also deletes the minikube cluster
```

Manual order (mirrors the script): delete chaos experiments first
(`kubectl delete podchaos,networkchaos --all -n ecommerce`), then Istio
routing, then app manifests, then observability, then the namespaces, then
`istioctl uninstall -y` if you are not deleting the cluster. Deleting the
`ecommerce` namespace before removing Istio leaves the ingressgateway with
dangling VirtualServices — harmless but noisy in `istioctl analyze`.

## Troubleshooting

| Symptom | Cause + fix |
|---------|-------------|
| Pods show `1/2`, `istio-proxy` shows `Error` / `CrashLoopBackOff` | Sidecar injected but app started and died, or proxy can't reach istiod. Restart AFTER injection is enabled: `kubectl -n ecommerce rollout restart deploy` and check `kubectl -n ecommerce logs <pod> -c istio-proxy`. |
| No sidecar at all (`1/1`) | Namespace not labeled or pods created before the label. Verify `kubectl get ns ecommerce --show-labels`; if missing, `kubectl label ns ecommerce istio-injection=enabled` then `kubectl -n ecommerce rollout restart deploy`. |
| `ImagePullBackOff` / `ErrImagePull` for `ecommerce/*:1.0.0` | Image never loaded into Minikube. Run `scripts/k8s-build-load.ps1`, or `minikube image load ecommerce/user-service:1.0.0`. Check with `minikube image ls \| findstr ecommerce`. |
| CrashLoop with `Cannot find module '@ecommerce/shared'` | Image was built from a stale tree — rebuild (the Dockerfile copies `dist` from the build stage; a plain `docker build` cache hit can mask a bad copy). `docker build --no-cache -f services/user-service/Dockerfile -t ecommerce/user-service:1.0.0 .` then reload. |
| Services log `OTLP error: connect ECONNREFUSED` | Collector Service name/namespace mismatch, or collector pod not Ready. Verify `kubectl -n observability get svc otel-collector` and that ConfigMap URL is `http://otel-collector.observability.svc.cluster.local:4318`. Spans are lost but services keep serving — fix forward. |
| Prometheus target `up == 0` for a service | Pod not Ready, wrong port in `prometheus-config`, or the scrape is going through a network policy. `kubectl -n observability port-forward svc/prometheus 9090:9090` then open Status → Targets for the error text. |
| Gateway 503 on `http://<minikube-ip>/` | frontend Service/Endpoints empty (no Ready pods) or the VirtualService route doesn't match. `kubectl -n ecommerce get endpoints frontend`. |
| `kubectl apply` of chaos CRs fails with "no matches for kind" | Chaos Mesh CRDs not installed yet. Re-run the helm install in step 1d; check `kubectl get crd \| findstr chaos-mesh`. |
| Port-forward dies when the terminal closes | That's expected kubectl behaviour — keep `scripts/port-forward.ps1` running, or switch to the NodePort patches above. |
| Minikube VM swapping / pods evicted | VM too small. Restart with `minikube start --memory 8192 --cpus 4`; close other heavy Docker workloads. |
