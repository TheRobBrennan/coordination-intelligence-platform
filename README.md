# CXC Coordination Intelligence Platform — PoC

A graph-based coordination-intelligence proof of concept for CXC. Type a topic →
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
cp .env.example .env          # fill in LLM key etc.
docker compose -f infra/docker-compose.yml up -d   # neo4j + keycloak
# ingestion (Python 3.12+, uv recommended)
cd ingestion && uv sync && uv run pytest
# api
cd ../apps/api && uv sync && uv run pytest && uv run uvicorn app.main:app --reload
# web
cd ../web && pnpm install && pnpm dev
```

See `docs/runbook.md` for the full demo flow.

## Constraints baked in

- **Testable** — vitest (web), Playwright (e2e), pytest (api + ingestion).
- **Modular** — LLM provider and auth are behind swappable adapters.
- **Env-driven** — every endpoint/key/provider is an env var. Nothing hardcoded.
- **Production-portable** — auth (Keycloak) and hosting can be replaced without
  touching app logic.
