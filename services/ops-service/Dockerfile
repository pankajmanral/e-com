# ---------------------------------------------------------------------------
# ops-service — multi-stage image. BUILD CONTEXT IS THE REPOSITORY ROOT:
#   docker build -f services/ops-service/Dockerfile -t ecommerce/ops-service:1.0.0 .
# NOTE: the ops-service is the chaos/observability control plane. In
# CHAOS_MODE=k8s it applies Chaos Mesh / Istio fault-injection resources
# against the cluster; the image assumes that is done through the Kubernetes
# API (or that CHAOS_MODE=local is used in plain Docker). If the service is
# implemented to shell out to the kubectl binary instead, add:
#   ARG KUBECTL_VERSION=v1.31.4
#   RUN curl -fsSL -o /usr/local/bin/kubectl \
#         "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
#     && chmod +x /usr/local/bin/kubectl
# to the runtime stage and mount a ServiceAccount token (k8s/ops-service.yaml
# already provisions a ServiceAccount + Role for it).
# ---------------------------------------------------------------------------

FROM node:24-alpine AS build
WORKDIR /app

# Workspace manifests first (cached layer; npm ci only needs the manifests of
# the workspaces that exist in the context).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/ops-service/package.json services/ops-service/
RUN npm ci --no-audit --no-fund

# Build inputs: the shared runtime library and this service.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/ops-service services/ops-service

# NOTE --declaration: tsconfig.base.json sets "declaration": false but
# packages/shared/package.json advertises types at dist/index.d.ts, so the
# services cannot type-check without emitted declarations. Pass the flag here
# instead of patching packages/* (drop it once packages/shared/tsconfig.json
# gains "declaration": true upstream).
RUN npm run build -w @ecommerce/shared -- --declaration \
 && npm run build -w @ecommerce/ops-service

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4004

# Production-only install; @ecommerce/shared resolves to the workspace
# symlink and its dist is copied from the build stage below.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/ops-service/package.json services/ops-service/
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/ops-service/dist services/ops-service/dist

USER node
EXPOSE 4004
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4004)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/ops-service/dist/index.js"]
