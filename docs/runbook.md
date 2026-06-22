# Coordination Intelligence Platform — Runbook

## 0. Prereqs
- **Docker Desktop** — the only required install. Everything else runs in containers.
- An LLM key: `ANTHROPIC_API_KEY` (default) or OpenAI/Azure if you flip `LLM_PROVIDER`.
- (Optional, native path only) Python 3.14 + `uv`, Node 24 LTS + `pnpm` 11
  (`nvm use` reads `.nvmrc` → 24.17.0) — see
  [pnpm-for-npm-users.md](pnpm-for-npm-users.md). Not needed for the `make` flow.

## 1. Bring up the stack
```bash
cp .env.example .env        # fill ANTHROPIC_API_KEY, set passwords
make up                     # Neo4j + Keycloak + API (hot reload). Ctrl+C stops.
# add the web UI once scaffolded:  make up-web
```
- Neo4j browser: http://localhost:7474 (neo4j / $NEO4J_PASSWORD)
- API: http://localhost:8000  ·  Keycloak admin: http://localhost:8080 (admin / $KC_ADMIN_PASSWORD)
  - Realm `platform` is auto-imported with users **rob** (admin, analyst) and **kathy** (analyst).
  - ⚠️ Passwords in `infra/keycloak/realm-export.json` are temporary placeholders
    (`changeme`) — change on first login and set the real client secret in `.env`.

## 2. Run the test suites (all should be green before any feature work)
```bash
make test                                # API routes, in the api container
```
The ingestion extractor/loader tests run natively (they're fully offline — no DB,
no API key, HTML fixtures): `cd ingestion && uv sync --extra dev && uv run pytest`.
No `PYTHONPATH` needed — `pythonpath` is set in each `pyproject.toml`.
(An `ingestion` test service can be added to compose later if a Docker-only test
run is wanted there too.)

## 3. Ingest (offline batch — the slow/expensive part)
```bash
cd ingestion
uv run playwright install chromium       # one-time
uv run python -m cip_ingest.run --seed seed/organizations.json   # (run.py = day 3-4)
```
Re-runs are idempotent (MERGE) — this doubles as the "refresh agent".

**No API key?** Pick a no-key extraction mode in `.env` (see the table in the
README): `LLM_PROVIDER=claude_cli` uses the Claude Code CLI on your subscription
(run natively as above — it needs your `claude` login); `LLM_PROVIDER=mock` runs a
deterministic offline extraction; `LLM_PROVIDER=manual` writes prompts to paste
into Claude Desktop. With the default `anthropic` and no key set, the pipeline
auto-uses `claude_cli` if `claude` is installed. CLI runs are logged to
`cli-runs/<org>-YYYYMMDD-HHMM.md`.

## 4. Serve the demo
`make up` already serves the API (`:8000`) and, with `make up-web`, the web UI
(`:3000`) — both with hot reload. No separate serve step.

## 5. Demo flow for Kathy
1. Search a topic (e.g. "supply chain resilience") → list of orgs across sectors.
2. Click an org → its topics + the **source evidence** + confidence per edge.
3. Graph view → see cross-sector overlap; highlight two orgs on the same topic
   with no direct connection = "unconnected parallel efforts" (stretch).

## Deploy (Vercel + AuraDB)
- Create a free Neo4j AuraDB; copy the `neo4j+s://…` URI + creds into Vercel env.
- Point ingestion's `NEO4J_URI` at AuraDB and run the batch once to populate.
- Deploy `apps/web` to Vercel; deploy `apps/api` to Vercel/Render/Fly (it's a
  read-only service — no Playwright at request time, so serverless is fine).
