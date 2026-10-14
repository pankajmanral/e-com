# ---------------------------------------------------------------------------
# web — Next.js 16 standalone storefront + resilience admin dashboard.
# BUILD CONTEXT IS THE REPOSITORY ROOT:
#   docker build -f apps/web/Dockerfile -t ecommerce/web:1.0.0 .
# next.config.ts sets output:'standalone' with outputFileTracingRoot at the
# monorepo root, so WORKDIR /app mirrors the repo layout and the standalone
# server ends up at apps/web/server.js inside the runtime image.
# ---------------------------------------------------------------------------

FROM node:24-alpine AS build
WORKDIR /app

# Workspace manifests first (cached layer). The web app has no dependency on
# @ecommerce/shared, so apps/web alone is enough for npm ci.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN npm run build -w @ecommerce/web

# Stage the optional public/ directory so the runtime COPY never fails when
# the app has no public assets (apps/web has no public/ in this repo).
RUN mkdir -p /app/stage/public \
 && if [ -d /app/apps/web/public ]; then cp -r /app/apps/web/public/. /app/stage/public/; fi

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output carries the whole traced dependency tree; the monorepo
# layout means server.js sits under apps/web/.
COPY --from=build /app/apps/web/.next ./
# Next.js requires static assets and public/ next to server.js at runtime.
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/stage/public apps/web/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
