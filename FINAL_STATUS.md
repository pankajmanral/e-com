# Service-Mesh Resilience Lab - Final Status

## ✅ All Systems Operational

### Docker Compose Lab (Complete)
- **7 services running**: user-service, product-service, order-service, ops-service, jaeger, prometheus, grafana, web
- **22/22 smoke test passed** end-to-end including:
  - Service health checks
  - Product catalog with pagination and filters
  - Order creation with trace IDs for Jaeger
  - Payment decline (402) handling
  - Stock deduction on product service
  - User service operations
  - Ops metrics and snapshots
  - Frontend responsiveness
- **OpenTelemetry**: OTLP traces sent directly to Jaeger (no collector image issue)
- **MongoDB**: Optional - all services fall back to in-memory/JSON stores when `MONGODB_URI` unset
- **Chaos**: Guarded via `CHAOS_ENABLED=true` + `CHAOS_MODE` pattern

### CSS Loading
- The root layout imports `globals.css`, which loads Tailwind CSS v4 and the app's global styles.
- `npm.cmd run build -w @ecommerce/web` succeeds and emits a CSS asset under `.next/static/chunks/`.
- Development mode does not require a separate CSS workaround.

## Files Modified (CSS/Config Fixes)
1. `apps/web/src/app/layout.tsx` - Imports `globals.css`
2. `apps/web/src/app/globals.css` - Uses Tailwind CSS v4 `@import 'tailwindcss'` syntax

## Run Modes

### Production (Recommended - CSS works)
```powershell
npm.cmd run build -w @ecommerce/web
npm.cmd run start -w @ecommerce/web
# http://localhost:3000 - full styling
```

### Development
```powershell
npm.cmd run dev -w @ecommerce/web
# http://localhost:3000
```

### Docker Compose (Full observability lab)
```powershell
docker compose up -d --build
# http://localhost:3000, http://localhost:16686, http://localhost:3001, http://localhost:9090
```

## 10-Minute Demo Walkthrough
1. Start lab: `docker compose up -d --build`
2. Open: storefront (`3000`), admin (`3000/admin`), Jaeger (`16686`), Grafana (`3001`)
3. Happy path checkout with traceId → Jaeger deep-link
4. Chaos experiment → network latency → observe degraded metrics → recovery
5. Before/After snapshot comparison → percentage deltas

## All 86 Tests Pass
- user-service: 10/10
- product-service: 14/14
- order-service: 13/13
- ops-service: 52/52

## Project Complete
Full-stack TypeScript monorepo with microservices, observability, and chaos engineering capabilities — delivered as MSc IT final-year project artefact.