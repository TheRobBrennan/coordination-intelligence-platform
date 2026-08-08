# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Status

Scaffolded by Opus 4.8. `apps/web` is generated (Next.js, NextAuth/Keycloak
sign-in wired up) but has no search/graph UI yet — just a sign-in/sign-out
screen. Ingestion has never been run end-to-end against Neo4j, so `make up` /
`make up-web` bring up an empty graph until the batch job is run once. Don't
assume anything builds or boots until it's actually been verified end-to-end.

## What this is

A two-week PoC: type a topic, see which organizations across critical-infra
sectors work on it, with source evidence, and explore how they connect via a
graph. Read `README.md` for the full picture; the one-paragraph version:

```
apps/web        Next.js — search UI + graph viz (NOT YET SCAFFOLDED)
apps/api        FastAPI — read-only API over the graph
ingestion       Python — scrape → extract → load (offline batch, writes to Neo4j)
packages/shared topic taxonomy + shared types
infra           docker-compose: neo4j, keycloak, postgres, api, web
docs            ADRs, data model, runbook
```

Ingestion is offline/batch (Playwright scrape + LLM extraction → Neo4j). The
demo app only ever *reads* the graph. `apps/api` exposes `Graph` behind a
`Protocol` (`apps/api/app/graph.py`) so routes are testable without live Neo4j.
The LLM extraction adapter (`ingestion/cip_ingest/adapters/`) and auth provider
are both swappable — don't hardcode against one provider when adding to either
seam.

## Package managers — pnpm and uv, never npm/pip directly

- **JS/TS (`apps/web`, `packages/shared`, root scripts): pnpm only.** Root
  `package.json` pins `packageManager: pnpm@11.8.0` and `engines.pnpm: >=11`.
  Never run `npm install`, `npm run`, or `npx` in this repo or suggest them to
  the user — use `pnpm`, `pnpm add`, `pnpm dlx`. See
  [docs/guides/pnpm-for-npm-users.md](docs/guides/pnpm-for-npm-users.md) for the full
  cheat sheet (the user is coming from npm and has npm muscle memory/aliases —
  always give them the pnpm command, not npm).
- **Python (`apps/api`, `ingestion`): uv only.** Both are managed with `uv`
  (`uv sync`, `uv run ...`) per their `pyproject.toml` — don't suggest bare
  `pip install` or `python -m venv`.
- **Don't add or commit `package-lock.json`** — if one appears, that means
  `npm` was run by mistake; delete it and redo with `pnpm install`.

## Commands

Two ways to run things — prefer `make` (everything containerized) unless doing
fast-iteration native dev:

```bash
make up            # Neo4j + Keycloak + API, hot reload (Docker only)
make up-web        # same + Next.js web (once apps/web is scaffolded)
make down / clean  # stop / hard reset (wipes volumes)
make check         # report active LLM extraction mode (key vs subscription vs mock)
make test          # API test suite, in-container
make test-ingest   # ingestion test suite, in-container
make test-web      # ALL web tests: vitest unit + Playwright e2e — needs `make up-web`
                   # already running first; runs via host pnpm, not containerized
                   # (Playwright drives a real browser through Keycloak login)
make test-web-headed  # same, but headed + slowed down (PLAYWRIGHT_SLOW_MO=500ms)
                   # so you can actually watch the browser instead of it blinking by

# pnpm wrappers — pnpm start/stop/build/clean just shell out to the make
# targets above (one source of truth for the docker compose invocation):
pnpm install       # whole JS workspace
pnpm start         # = make up
pnpm stop          # = make down
pnpm dev:api       # native-only fast iteration: just FastAPI (uv run uvicorn ...)
pnpm test:web      # vitest ONLY (fast, no live stack needed) — for the full web
                   # suite including e2e, use `make test-web` instead

cd apps/api && uv run pytest          # api tests, native
cd ingestion && uv sync --extra dev && uv run pytest   # ingestion tests, native (offline, no DB/key)
```

## First local run — what to expect

`apps/web` doesn't exist as a package yet, so `pnpm install` at the root has
nothing to install there until it's scaffolded per
[apps/web/README.md](apps/web/README.md):

```bash
cd apps/web
pnpm create next-app@latest . --ts --app --eslint --tailwind --src-dir --use-pnpm
```

Expect to hit rough edges on the first `make up` / `pnpm install` — this has
not been smoke-tested. Work through them rather than papering over with
fallbacks; flag anything in `docs/` that turns out to be wrong so it gets
corrected at the source.

## Git workflow

- **Branch naming:** `YYYY.MM.DD/short-description`, e.g.
  `2026.06.22/update-claude-md` — date the branch was created, then a short
  kebab-case description of the work. Don't use plain feature-name branches
  (`feature/x`, `fix-y`) without the date prefix.
- Branch off `main`, open a PR against `main` when ready.

## Conventions

- **Env-driven, nothing hardcoded.** Every endpoint/key/provider is in
  `.env` (`.env.example` is the source of truth for what's configurable).
- **Testable.** vitest (web), Playwright (e2e), pytest (api + ingestion).
- Auth (Keycloak) is *not* enforced yet in the API — see the seam noted in
  `apps/api/app/main.py` before wiring it in.
- Neo4j Cypher queries live in `apps/api/app/graph.py` — keep new read
  queries there, not scattered into route handlers.
