# CXC PoC — Runbook

## 0. Prereqs
- Docker, Python 3.12+ (`uv` recommended), Node 20+ (`pnpm`).
- An LLM key: `ANTHROPIC_API_KEY` (default) or OpenAI/Azure if you flip `LLM_PROVIDER`.

## 1. Bring up infra
```bash
cp .env.example .env        # fill ANTHROPIC_API_KEY, set passwords
docker compose -f infra/docker-compose.yml up -d
```
- Neo4j browser: http://localhost:7474 (neo4j / $NEO4J_PASSWORD)
- Keycloak admin: http://localhost:8080 (admin / $KC_ADMIN_PASSWORD)
  - Realm `cxc` is auto-imported with users **rob** (admin, analyst) and **kathy** (analyst).
  - ⚠️ Passwords in `infra/keycloak/cxc-realm.json` are temporary placeholders
    (`changeme`) — change on first login and set the real client secret in `.env`.

## 2. Run the test suites (all should be green before any feature work)
```bash
cd ingestion && uv sync --extra dev && uv run pytest      # extractor/loader
cd ../apps/api && uv sync --extra dev && uv run pytest     # read API routes
cd ../web && pnpm install && pnpm test                     # vitest (once scaffolded)
```

## 3. Ingest (offline batch — the slow/expensive part)
```bash
cd ingestion
uv run playwright install chromium       # one-time
uv run python -m cxc_ingest.run --seed seed/organizations.json   # (run.py = day 3-4)
```
Re-runs are idempotent (MERGE) — this doubles as the "refresh agent".

## 4. Serve the demo
```bash
cd apps/api && uv run uvicorn app.main:app --reload   # :8000
cd apps/web && pnpm dev                                # :3000
```

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
