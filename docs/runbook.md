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
uv run python -m cip_ingest.run                      # every org in the seed list
uv run python -m cip_ingest.run --only "Lumen Technologies" --dry-run   # scrape+extract, write nothing
uv run python -m cip_ingest.run --limit 3             # first N orgs — the ladder, not all 26 at once
```
`--seed PATH` points at a different seed file (default `seed/organizations.json`).
One org failing (bad URL, DNS, extraction error) never aborts the run — it's
logged, counted, and the run continues; `needs_validation` orgs are expected
to fail until their URL is confirmed. Re-runs are idempotent (MERGE) — this
doubles as the "refresh agent".

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
1. Sign in (`demo-analyst` / `demo`). Type a topic (or click a suggested
   chip, e.g. "Supply chain resilience") → orgs grouped by sector, each with
   confidence and a verbatim evidence quote from their real site + a link to
   the source.
2. The bipartite graph under the results — click any topic or org pill to
   highlight just its connections; click a connecting line itself to
   highlight one specific edge; click empty space to clear.
3. **"Behind the scenes"** (top-right link, `/pipeline`) — the operational
   view of the whole thing:
   - Live counts (orgs/topics/connections) straight from Neo4j
   - The architecture split into a **backend** zone (offline ingestion:
     seed list → scraper → extractor → Neo4j) and a **frontend** zone
     (always-on, read-only: Neo4j → API → this web app), with a small
     animated dot showing data flow direction on each side
   - The same full-graph visualization as the search page, but showing
     everything currently loaded, not just one query's results
   - **Live admin controls**, all real (not staged): "Reset to clean demo
     set" and "Clean to empty" wipe/reload the graph; "Run selected" /
     "Run all cached" re-run extraction for chosen orgs. These replay
     cached HTML snapshots (`ingestion/seed/fixtures/`) rather than a live
     scrape, so they stay fast and don't depend on wifi at the table — see
     `apps/api/app/admin.py` for the `/admin/*` routes behind them.
   - The seed list shows every org's real status — loaded, cached-but-not-
     loaded, or a specific reason it isn't ready (no URL on file, a DNS
     failure from the last real fetch attempt, etc.) — sourced from an
     actual ingestion attempt (`ingestion/seed/fetch-log.json`), not a
     generic placeholder.

## Preview — Cloudflare Tunnel

The Vercel + AuraDB path in the original plan assumed auth stayed thin. It
didn't — Keycloak is staying (see `docs/plans/2026.08.08/kathy-demo.md`),
and Vercel cannot host a stateful, always-on Keycloak + Postgres. A Cloudflare
Tunnel from the same machine running `make up-web` gets a real HTTPS URL without
a hosting decision at all — `cip-preview-web.sploosh.ai`,
`cip-preview-auth.sploosh.ai`, and `cip-preview-neo4j.sploosh.ai`, all with
valid TLS, no inbound ports, no server to rent. The Neo4j route is the graph
browser's own admin console, not part of the demo — see the security note in
`docs/cloudflare/tunnel-setup.md` before treating it as casually shareable;
`NEO4J_PASSWORD` needs to be a real value, not the local-dev default, before
this route is actually safe.

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

**Fastest path: `./scripts/preflight-check.sh`** (`--no-pause` to run
unattended, `--headed` for a real visible browser window slowed down enough
to watch with someone rather than trusting a pass/fail log). It does
everything below automatically — clean slate, local login proven via
`apps/web/e2e/login.spec.ts` (real assertions, not a page-load check), tunnel
up, tunnel login proven, tunnel down, tunnel URLs proven actually gone, local
proven again — and leaves the stack running local-only when it finishes, as
independent detached containers that survive the script's own process
exiting (confirmed directly: `docker ps` + a live `curl` well after the
script completed, not assumed from the exit code). See
`docs/plans/2026.08.08/kathy-demo.md` for the full list of what it caught
along the way (cold-start latency on the tunnel's first hit, `make clean`
never reaching the tunnel's `cloudflared` container, Keycloak's readiness not
waited for after `down-tunnel`, and the script's own stack-survives-exit bug)
if any of those ever regress.

**The manual sequence below** is what the script automates — useful if the
script itself is ever in question, or you're doing this by hand for some
other reason.

**The tunnel-enabled stack and the plain local stack cannot run at the same
time** — `web` binds host port 3000 in both. Verifying "the tunnel works" and
verifying "local still works, untouched" are two separate runs, not one run
checked from two browser tabs:

1. `make up-tunnel`, wait for `cloudflared` to report a healthy connection in
   `make logs-tunnel`
2. Visit `https://cip-preview-web.sploosh.ai` in a browser, sign in with a real
   Keycloak account (e.g. `demo-analyst` / `demo`), confirm the session shows,
   sign out, confirm it lands back on `cip-preview-web.sploosh.ai` (not
   localhost). Optionally also visit `https://cip-preview-neo4j.sploosh.ai` to
   confirm the graph browser's login screen loads (see the security note
   above before treating this as more than a login-screen check).
3. `make down-tunnel` — this stops `cloudflared` **and** recreates `web` /
   `keycloak` against the base compose file, so it genuinely reverts to
   local-only config, not just "the tunnel container is gone." Two bugs
   surfaced writing this target, both confirmed fixed by actually running it,
   not by reading it:
   - The original version only removed `cloudflared` and left `web` /
     `keycloak` running with the tunnel's `AUTH_URL` / `KC_HOSTNAME` still
     baked in — confirmed by `docker exec cip-web printenv AUTH_URL` still
     showing the public URL afterward. The page loaded; real login stayed
     broken.
   - Fixing that (adding the `--force-recreate web keycloak` step) still
     failed with `no such service: web` on the very first line, in a
     completely clean run with nothing else going on — not a one-off race.
     `cloudflared` depends on `web`, which is profile-gated
     (`profiles: ["web"]`); the `stop`/`rm`/`logs` commands never passed
     `--profile web --profile tunnel`, so compose couldn't resolve the
     dependency graph. Fixed by adding the profile flags to all three.

   Sign in again on `http://localhost:3000` from a fresh tab to confirm the
   revert actually took — confirmed working end to end as of this writing.

**Gotcha, found by testing, not by reading the compose file:** once `AUTH_URL`
is set (see below), Auth.js issues `Secure`-flagged cookies, which browsers
refuse to store over a plain `http://` connection. So while the tunnel-enabled
stack is up, even hitting `localhost:3000` directly breaks login
(`InvalidCheck: pkceCodeVerifier value could not be parsed`) — the two modes
are mutually exclusive, not "same app, different door."

If sign-in over the tunnel fails partway, the fix lives in one of three places
in `infra/docker-compose.tunnel.yml`, depending on the error:

| Error | Fix location |
|---|---|
| `unexpected "iss" response parameter value` | `keycloak.environment.KC_HOSTNAME` — Keycloak is reporting `http` instead of `https` in its own issuer claim |
| `redirect_uri did not match... parameter: https://localhost:3000/...` | `web.environment.AUTH_URL` — Host-header inference came back wrong through the tunnel |
| Login redirects to the wrong host generally | `web.environment.KEYCLOAK_ISSUER` / `POST_LOGOUT_REDIRECT_URI`, or the realm's `redirectUris` |

Never in the base `docker-compose.yml`.

See `docs/plans/2026.08.08/kathy-demo.md` for the full design rationale,
including why the first read of the repo concluded `KC_HOSTNAME` wasn't needed
— and why that conclusion turned out to be wrong once actually tested.

### Privileged database access (optional — keys to the kingdom)

The `cip-preview-neo4j.sploosh.ai` route above only carries Neo4j Browser's
*web page*. You can load it and see the connect screen, but signing in from
there hangs forever — browsers can only speak WebSocket, and Bolt (Neo4j's
real protocol) isn't WebSocket. That's a hard limitation, not a
misconfiguration; no tunnel setting fixes it.

Actual database access — unrestricted Cypher, read/write, the equivalent of
having the database password — needs a fourth route and a native (non-browser)
Bolt client. Setup lives in `docs/cloudflare/tunnel-setup.md`, "Step 4 — Add a
fourth route for real database access." Once that route and its Access policy
exist:

```bash
cloudflared access tcp --hostname cip-preview-bolt.sploosh.ai --url localhost:17687
```

Then point any native Bolt client at `bolt://localhost:17687` — confirmed
working with both a plain Python `neo4j` driver query and a live
[Neo4j Desktop 2](https://neo4j.com/download/) connection. Neo4j Desktop is a
genuinely convenient option here: it's a native (Electron main-process) Bolt
client, not a browser tab, so it isn't subject to the WebSocket limitation
above. Worth keeping two saved connections side by side once it's set up:

| Connection name | URL | What it actually is |
|---|---|---|
| Local (direct) | `bolt://localhost:7687` | Straight to the Docker container, tunnel not involved |
| Via Cloudflare Tunnel | `bolt://localhost:17687` | Through `cloudflared access tcp` — this is what's actually reaching the tunnel |

This is optional, and deliberately not part of the default setup — most people
working on this project never need it. Only set it up for whoever actually
needs to run ad hoc Cypher against the live graph, and keep the Access policy
scoped to specific people (an email allowlist), not "anyone authenticated."
