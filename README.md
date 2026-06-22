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
infra           docker-compose: neo4j, keycloak, postgres, api, web (+ Dockerfiles)
docs            ADRs, data model, runbook
```

## Get started — the only thing you install is Docker Desktop

Everything else (Neo4j, Keycloak, Python, Node, pnpm) runs inside containers at
versions pinned in the images — nothing to install on your machine, nothing to
match.

```bash
git clone <repo> && cd coordination-intelligence-platform
cp .env.example .env          # add your ANTHROPIC_API_KEY
make up                       # ← builds + starts the whole stack
```

That's it. `make up` brings up:

| Service | URL | Notes |
|---|---|---|
| Neo4j (graph DB) | http://localhost:7474 | browser; bolt on :7687 |
| Keycloak (auth) | http://localhost:8080 | realm `platform` auto-seeds users `rob` / `kathy` |
| API (FastAPI) | http://localhost:8000 | hot reload — edit `apps/api`, it reloads in place |

`Ctrl+C` stops it. The web UI (`apps/web`) starts too once it's scaffolded —
`make up-web` (see [`apps/web/README.md`](apps/web/README.md)).

### Everyday commands (only Docker required)

| Command | What it does |
|---|---|
| `make up` | Build + start the stack (Neo4j + Keycloak + API), with hot reload. |
| `make up-web` | Same, plus the Next.js web app (once `apps/web` exists). |
| `make down` | Stop everything. |
| `make build` | Rebuild images from scratch (no cache) and recreate containers. |
| `make clean` | Hard reset — wipe data volumes + built images for a fresh slate. |
| `make logs` / `make ps` | Tail logs / list running services. |
| `make test` | Run the API test suite inside the container. |

> No `make`? It ships with macOS (Xcode command-line tools). Or run the raw
> command behind any target, e.g. `docker compose -f infra/docker-compose.yml up`.

### Dev environment

Built and tested on a **2021 MacBook Pro (Apple M1 Max, 64 GB, macOS Tahoe
26.5.1)**. All images are multi-arch, so they run natively on Apple Silicon
(arm64) and on x86. Pinned versions: **Neo4j 5**, **Keycloak 26**, **Postgres
16**, **Python 3.12**, **Node 24.17.0 LTS** (Krypton), **pnpm 10.11.1** — all
declared in `infra/docker-compose.yml`, the per-app `Dockerfile.dev` files,
`.nvmrc`, and `package.json` (`engines` + `packageManager`).

### Prefer to run the apps natively? (optional)

If you'd rather run the API/web directly on your machine for faster reloads, you
can — you'll need Node 24 LTS + pnpm 10 and Python 3.12 + uv installed. With
`nvm`, just `nvm use` in the repo root (it reads `.nvmrc` → Node 24.17.0). The
`pnpm` scripts (`pnpm start` / `stop` / `dev:api`) cover that path; see
[`docs/pnpm-for-npm-users.md`](docs/pnpm-for-npm-users.md) if pnpm is new to you.
The containerized `make` flow above is the recommended default.

See `docs/runbook.md` for the full demo flow (ingestion, seeding, the demo).

## Constraints baked in

- **Testable** — vitest (web), Playwright (e2e), pytest (api + ingestion).
- **Modular** — LLM provider and auth are behind swappable adapters.
- **Env-driven** — every endpoint/key/provider is an env var. Nothing hardcoded.
- **Production-portable** — auth (Keycloak) and hosting can be replaced without
  touching app logic.
