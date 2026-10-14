# ---------------------------------------------------------------------------
# order-service — multi-stage image. BUILD CONTEXT IS THE REPOSITORY ROOT:
#   docker build -f services/order-service/Dockerfile -t ecommerce/order-service:1.0.0 .
# The service persists orders to services/order-service/data/orders.json, so
# the runtime image pre-creates that directory owned by the node user.
# In Kubernetes it is overlaid by an emptyDir (k8s/order-service.yaml).
# ---------------------------------------------------------------------------

FROM node:24-alpine AS build
WORKDIR /app

# Workspace manifests first (cached layer; npm ci only needs the manifests of
# the workspaces that exist in the context).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/order-service/package.json services/order-service/
RUN npm ci --no-audit --no-fund

# Build inputs: the shared runtime library and this service.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/order-service services/order-service

# NOTE --declaration: tsconfig.base.json sets "declaration": false but
# packages/shared/package.json advertises types at dist/index.d.ts, so the
# services cannot type-check without emitted declarations. Pass the flag here
# instead of patching packages/* (drop it once packages/shared/tsconfig.json
# gains "declaration": true upstream).
RUN npm run build -w @ecommerce/shared -- --declaration \
 && npm run build -w @ecommerce/order-service

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4003

# Production-only install; @ecommerce/shared resolves to the workspace
# symlink and its dist is copied from the build stage below.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/order-service/package.json services/order-service/
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/order-service/dist services/order-service/dist

# Writable data dir for orders.json when running as USER node.
RUN mkdir -p services/order-service/data && chown node:node services/order-service/data

USER node
EXPOSE 4003
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4003)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/order-service/dist/index.js"]
