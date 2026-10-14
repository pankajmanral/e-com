# ---------------------------------------------------------------------------
# user-service — multi-stage image. BUILD CONTEXT IS THE REPOSITORY ROOT:
#   docker build -f services/user-service/Dockerfile -t ecommerce/user-service:1.0.0 .
# ---------------------------------------------------------------------------

FROM node:24-alpine AS build
WORKDIR /app

# Workspace manifests first (cached layer; npm ci only needs the manifests of
# the workspaces that exist in the context).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/user-service/package.json services/user-service/
RUN npm ci --no-audit --no-fund

# Build inputs: the shared runtime library and this service.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/user-service services/user-service

# NOTE --declaration: tsconfig.base.json sets "declaration": false but
# packages/shared/package.json advertises types at dist/index.d.ts, so the
# services cannot type-check without emitted declarations. Pass the flag here
# instead of patching packages/* (drop it once packages/shared/tsconfig.json
# gains "declaration": true upstream).
RUN npm run build -w @ecommerce/shared -- --declaration \
 && npm run build -w @ecommerce/user-service

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4001

# Production-only install; @ecommerce/shared resolves to the workspace
# symlink and its dist is copied from the build stage below.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/user-service/package.json services/user-service/
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/user-service/dist services/user-service/dist

USER node
EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/user-service/dist/index.js"]
