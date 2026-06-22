# Coordination Intelligence Platform — PoC

A graph-based coordination-intelligence proof of concept. Type a topic →
see which organizations across critical-infrastructure sectors are working on it,
with source evidence, and explore how they connect.

> Two-week PoC. Scope is deliberately narrow (Org + Topic, ~25 seed orgs, 2–3
> sectors). See `docs/` and the project notes in the Obsidian vault.

## Architecture (one paragraph)

The heavy, slow work — scraping org websites with Playwright and extracting
topics with an LLM — is an **offline batch job** (`ingestion/`) that writes to
Neo4j. The demo-facing app only ever **reads** the graph: a FastAPI read API
(`apps/api`) and a Next.js UI (`apps/web`). This separation is why hosting is
cheap: ingestion runs locally; only a fast read-only app deploys (Vercel +
Neo4j AuraDB free tier).

```
apps/web        Next.js — search UI + graph viz
apps/api        FastAPI — read API over the graph
ingestion       Python — scrape → extract → load (offline)
packages/shared topic taxonomy + shared types
infra           docker-compose: neo4j, keycloak, postgres
docs            ADRs, data model, runbook
```

## Quickstart

```bash
cp .env.example .env          # fill in ANTHROPIC_API_KEY etc.
pnpm install                  # root tools (concurrently) + workspace
cd ingestion && uv sync && cd ..      # ingestion deps (one-time)
cd apps/api && uv sync && cd ../..    # api deps (one-time)
pnpm start                    # ← brings up everything (see below)
```

## Local development — one command up, one command down

Docker holds only the **slow services** (Neo4j + Keycloak). The API and web app
run on the **host with hot reload**, so you rarely need to restart Docker — edit
code and it reloads in place.

| Command | What it does |
|---|---|
| `pnpm start` | Bring up Docker (Neo4j + Keycloak), then run the API (`uvicorn --reload`) and web (`next dev`) together with hot reload. `Ctrl+C` stops the apps; Docker keeps running. |
| `pnpm stop` | Shut everything down — stops the API/web (ports 8000/3000) **and** the Docker services, in one command. |
| `pnpm build` | Pull fresh Docker images and force-recreate the containers (clean image refresh). Data volumes are preserved. |
| `pnpm clean` | Hard reset — remove containers, **data volumes**, and locally built images. Use when you want a clean Neo4j/Keycloak slate. |
| `pnpm dev` | Just the apps (assumes Docker is already up via `pnpm infra:up`). |
| `pnpm infra:up` / `infra:down` | Start / stop only the Docker services. |

> Note: `pnpm dev:web` / `pnpm start` need `apps/web` scaffolded first
> (`create-next-app` — see `apps/web/README.md`). Until then, run the API alone
> with `pnpm dev:api`.

See `docs/runbook.md` for the full demo flow.

## Constraints baked in

- **Testable** — vitest (web), Playwright (e2e), pytest (api + ingestion).
- **Modular** — LLM provider and auth are behind swappable adapters.
- **Env-driven** — every endpoint/key/provider is an env var. Nothing hardcoded.
- **Production-portable** — auth (Keycloak) and hosting can be replaced without
  touching app logic.
