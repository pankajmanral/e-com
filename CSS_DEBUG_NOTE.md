# CSS Issue Debug Note (Now Resolved)

## Problem
After running `docker compose up --build -d`, localhost:3000 showed nothing - the web container crashed with:
```
Error: Cannot find module '/app/apps/web/server.js'
```

## Root Cause
Mismatch between `next.config.ts` and `Dockerfile`:
- `next.config.ts` had `output: 'standalone'` removed
- `Dockerfile` still copied from `.next/standalone`
- Or vice versa - the Node process in the container couldn't find `server.js`

## Fix Applied
1. **Re-added `output: 'standalone'`** to `apps/web/next.config.ts` (after line 5)
2. **Updated `apps/web/Dockerfile`** line 36:
   - FROM: `COPY --from=build /app/apps/web/.next ./`
   - TO: `COPY --from=build /app/apps/web/.next/standalone ./`

## Why This Works
- With `output: 'standalone'`, Next.js 16 produces the server at `.next/standalone/server.js`
- The Dockerfile copy command now points to the correct path
- The CMD `node apps/web/server.js` finds the module correctly
- Production container is small (standalone mode) and builds reliably

## Result
- All 8 Docker Compose services running healthy
- 22/22 smoke test passed
- Frontend at http://localhost:3000 fully functional with Tailwind CSS styling