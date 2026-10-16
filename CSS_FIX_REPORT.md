# CSS Loading Fix

The root App Router layout did not import `globals.css`, so Next.js never included
the Tailwind stylesheet in the page. The layout now imports `./globals.css`.

The stylesheet uses Tailwind CSS v4's `@import 'tailwindcss';` syntax. No
Turbopack cache workaround or legacy `@tailwind` directives are required.

Verification: `npm.cmd run build -w @ecommerce/web` succeeds and emits a CSS
asset under `apps/web/.next/static/chunks/`. Docker image verification still
requires Docker Desktop's Linux engine to be running.
