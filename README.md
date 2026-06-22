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
`make up-web` (see [`apps/web/README.md`](apps/web/README.md)). In Docker Desktop
everything is grouped under **`coordination-intelligence-platform`** with `cip-*`
container names, so it's easy to spot among other projects.

### URLs & sign-in (local dev)

Everything below is local-dev defaults from `.env.example` / the seed realm —
**change them before anything leaves your machine** (see "Change the passwords").

| What | URL | Username | Password |
|---|---|---|---|
| API health | http://localhost:8000/health | — | — |
| API docs (Swagger) | http://localhost:8000/docs | — | — |
| API — topics | http://localhost:8000/topics | — | — |
| Neo4j Browser | http://localhost:7474 | `neo4j` | `devpassword` |
| Keycloak admin | http://localhost:8080/admin | `admin` | `admin` |
| App user (admin role) | via the web app | `rob` | `changeme` (temporary) |
| App user (analyst role) | via the web app | `kathy` | `changeme` (temporary) |

> Neo4j Bolt connection string for tools: `bolt://localhost:7687` (`neo4j` / `devpassword`).
> The `rob` / `kathy` passwords are flagged **temporary** in the realm — Keycloak
> forces a reset on first login.

### Change the passwords

These defaults are fine on `localhost`; rotate them before any shared/remote use.

- **App users (`rob`, `kathy`)** — sign in once at the web app (or Keycloak
  Account console: http://localhost:8080/realms/platform/account) → Keycloak
  prompts for a new password because the seeds are temporary. To reset for
  someone else: Keycloak admin → realm `platform` → Users → *user* → Credentials.
- **Keycloak admin (`admin`/`admin`)** — set `KC_ADMIN` / `KC_ADMIN_PASSWORD` in
  `.env`, then `make build` (recreates the container). Or change it in the admin
  console under the master realm.
- **Neo4j (`neo4j`/`devpassword`)** — set `NEO4J_PASSWORD` in `.env` and
  `make clean && make up` (the password is baked at first init, so a fresh volume
  is needed), or change it live in Neo4j Browser with
  `ALTER CURRENT USER SET PASSWORD FROM 'devpassword' TO '...'`.
- **Realm client secret** — replace the `REPLACE_ME_IN_ENV` placeholder in
  `infra/keycloak/realm-export.json` and set `KEYCLOAK_CLIENT_SECRET` in `.env`.

### Check your LLM key before the first ingest

```bash
make check     # validates ANTHROPIC_API_KEY; if missing/invalid it writes a
               # timestamped, copy-paste help file to ingestion/diagnostics/
```

### Profile images

User avatars live in [`assets/avatars/`](assets/avatars/) (placeholder SVGs for
the seed users, named by username). The folder is mounted into the API at
`/srv/avatars` via `AVATARS_DIR` in `.env` — repoint it at any path, including a
share exported from a Docker host / VM. See
[`assets/avatars/README.md`](assets/avatars/README.md).

### Everyday commands (only Docker required)

| Command | What it does |
|---|---|
| `make` | List all targets (this is the default). |
| `make up` | Build + start the stack (Neo4j + Keycloak + API), with hot reload. |
| `make up-web` | Same, plus the Next.js web app (once `apps/web` exists). |
| `make down` | Stop everything. |
| `make build` | Rebuild images from scratch (no cache) and recreate containers. |
| `make clean` | Hard reset — wipe data volumes + built images for a fresh slate. |
| `make check` | Validate the LLM API key (writes a help file if it's missing/invalid). |
| `make test` / `make test-ingest` | Run the API / ingestion test suites in-container. |
| `make logs` / `make ps` | Tail logs / list running services. |

> No `make`? It ships with macOS (Xcode command-line tools). Or run the raw
> command behind any target, e.g. `docker compose -f infra/docker-compose.yml up`.

### Dev environment

Built and tested on a **2021 MacBook Pro (Apple M1 Max, 64 GB, macOS Tahoe
26.5.1)**. All images are multi-arch, so they run natively on Apple Silicon
(arm64) and on x86. **Latest stable across the board**, pinned: **Neo4j 2026.05**,
**Keycloak 26.6**, **Postgres 18**, **Python 3.14**, **Node 24.17.0 LTS**
(Krypton), **pnpm 11.8.0** — declared in `infra/docker-compose.yml`, the per-app
`Dockerfile.dev` files, `.nvmrc`, and `package.json` (`engines` + `packageManager`).

### Prefer to run the apps natively? (optional)

If you'd rather run the API/web directly on your machine for faster reloads, you
can — you'll need Node 24 LTS + pnpm 11 and Python 3.14 + uv installed. With
`nvm`, just `nvm use` in the repo root (it reads `.nvmrc` → Node 24.17.0); pnpm
is pinned via `packageManager`, so `corepack enable` makes the repo use 11.8.0
automatically. The `pnpm` scripts (`pnpm start` / `stop` / `dev:api`) cover that
path; see [`docs/pnpm-for-npm-users.md`](docs/pnpm-for-npm-users.md) if pnpm is
new to you.
The containerized `make` flow above is the recommended default.

See `docs/runbook.md` for the full demo flow (ingestion, seeding, the demo).

## Constraints baked in

- **Testable** — vitest (web), Playwright (e2e), pytest (api + ingestion).
- **Modular** — LLM provider and auth are behind swappable adapters.
- **Env-driven** — every endpoint/key/provider is an env var. Nothing hardcoded.
- **Production-portable** — auth (Keycloak) and hosting can be replaced without
  touching app logic.
