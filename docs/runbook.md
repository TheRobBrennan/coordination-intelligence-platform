# Coordination Intelligence Platform — Runbook

## 0. Prereqs
- **Docker Desktop** — the only required install. Everything else runs in containers.
- An LLM key: `ANTHROPIC_API_KEY` (default) or OpenAI/Azure if you flip `LLM_PROVIDER`.
- (Optional, native path only) Python 3.14 + `uv`, Node 24 LTS + `pnpm` 11
  (`nvm use` reads `.nvmrc` → 24.17.0) — see
  [guides/pnpm-for-npm-users.md](guides/pnpm-for-npm-users.md). Not needed for the `make` flow.

## 1. Bring up the stack
```bash
cp .env.example .env        # fill ANTHROPIC_API_KEY, set passwords
make up                     # Neo4j + Keycloak + API (hot reload). Ctrl+C stops.
# add the web UI once scaffolded:  make up-web
```
- Neo4j browser: http://localhost:7474 (neo4j / $NEO4J_PASSWORD)
- API: http://localhost:8000  ·  Keycloak admin: http://localhost:8080 (admin / $KC_ADMIN_PASSWORD)
  - Realm `platform` is auto-imported with users **demo-admin** (admin, analyst) and **demo-analyst** (analyst),
    both seeded with password `demo` — no forced reset, so the demo can sign straight in.
  - ⚠️ These are local-dev placeholders — rotate them and set the real client
    secret in `.env` before anything leaves your machine.
  - ⚠️ `--import-realm` only imports when the realm doesn't already exist. If you
    edit `infra/keycloak/realm-export.json` (seed users, roles, client) after a
    first boot, run `make clean && make up` — otherwise Keycloak keeps the realm
    already stored in its Postgres volume and your edits appear to do nothing.

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
`cli-runs/<org>-YYYYMMDD-HHMM-<TZ>.md` (local time; `<TZ>` = e.g. `PDT`/`PST`).

## 4. Serve the demo
`make up` already serves the API (`:8000`) and, with `make up-web`, the web UI
(`:3000`) — both with hot reload. No separate serve step.

## 5. Demo flow (analyst walkthrough)
1. Search a topic (e.g. "supply chain resilience") → list of orgs across sectors.
2. Click an org → its topics + the **source evidence** + confidence per edge.
3. Graph view → see cross-sector overlap; highlight two orgs on the same topic
   with no direct connection = "unconnected parallel efforts" (stretch).

## Preview — Cloudflare Tunnel

The Vercel + AuraDB path in the original plan assumed auth stayed thin. It
didn't — Keycloak is staying (see `docs/plans/plan-2026-08-08-kathy-demo.md`),
and Vercel cannot host a stateful, always-on Keycloak + Postgres. A Cloudflare
Tunnel from the same machine running `make up-web` gets a real HTTPS URL without
a hosting decision at all — `cip-preview-web.sploosh.ai` and
`cip-preview-auth.sploosh.ai`, both with valid TLS, no inbound ports, no server
to rent.

This is strictly additive: `infra/docker-compose.tunnel.yml` layers on top of
`infra/docker-compose.yml` and is never merged into it, so `make up` / `make
up-web` (no `-tunnel`) stay the localhost-only path, unconditionally, whether
or not the tunnel has ever been run.

### One-time setup — create the tunnel (Cloudflare account action, do this once)

This is a Cloudflare-dashboard action, not a code or terminal step, and it
needs the login for the account that manages `sploosh.ai` — not necessarily an
engineer's task. **See
[`docs/cloudflare/tunnel-setup.md`](cloudflare/tunnel-setup.md) for the full
walkthrough**, written for whoever holds those credentials, assuming zero
context about this repo. It produces one thing you need here: a `TUNNEL_TOKEN`
in `.env`.

Once that token is in place, import the realm changes already in this branch
(`redirectUris` + `post.logout.redirect.uris` for the tunnel hostname, plus
Keycloak's built-in Events) by running `make clean && make up` once —
`--import-realm` only re-imports on a fresh volume, so a plain `make up` will
silently skip an already-initialized realm. This only needs repeating if
`infra/keycloak/realm-export.json` changes again later.

### Every time after that

```bash
make up-tunnel      # everything make up-web gives you, plus the tunnel
make down-tunnel    # stop and remove just the tunnel container — the app keeps running
make logs-tunnel     # tail the tunnel's connection status
```

### Verifying it actually works

1. `make up-tunnel`, wait for `cloudflared` to report a healthy connection in
   `make logs-tunnel`
2. Visit `https://cip-preview-web.sploosh.ai` in a browser, sign in with a real
   Keycloak account (e.g. `demo-analyst` / `demo`), confirm the session shows,
   sign out, confirm it lands back on `cip-preview-web.sploosh.ai` (not
   localhost)
3. In a **separate terminal**, confirm `make up-web` (no tunnel) still signs in
   cleanly on `http://localhost:3000` — this is the guarantee that step 2 never
   put localhost at risk
4. `make down-tunnel`, confirm the web/api/neo4j/keycloak containers are still
   running (`make ps`) and `localhost:3000` still works

If step 2 fails partway (e.g. login redirects to the wrong host), the fix lives
in `infra/docker-compose.tunnel.yml`'s `web.environment` block
(`KEYCLOAK_ISSUER` / `POST_LOGOUT_REDIRECT_URI`) or in the realm's
`redirectUris` — never in the base `docker-compose.yml`.

See `docs/plans/plan-2026-08-08-kathy-demo.md` for the full design rationale —
why `KEYCLOAK_ISSUER` and not `KC_HOSTNAME` is the actual coupling point, and
why the fix is a compose override rather than a shared `.env` edit.
