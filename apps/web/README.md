# apps/web — Coordination Intelligence search UI

Next.js (App Router) front end: topic/org search + force-directed graph view.
Scaffolded with `create-next-app` (TypeScript, App Router, Tailwind, `src/`).

## Run it

From the repo root: `make up-web` (containerized, alongside the rest of the
stack) or `pnpm dev:web` (native, faster reload — needs the API already
running via `make up`). Either way it's served at http://localhost:3000.

## Conventions
- Talk only to the read API via `NEXT_PUBLIC_API_BASE_URL` — no DB access from web.
- Auth via Auth.js (NextAuth) Keycloak provider, behind a `getSession()` seam so
  the IdP can be swapped for production without touching pages.
- `pnpm test` → vitest (unit), `pnpm e2e` → Playwright.

## First screens
1. `/` — search box + results list (Topic→Orgs, Org→Topics).
2. `/graph` — force-directed graph of Org—Topic edges, color by sector.
3. Evidence drawer — click an edge to see source snippet + confidence.
