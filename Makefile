# Convenience wrapper around docker compose. The ONLY prerequisite is Docker
# Desktop (make ships with macOS / the Xcode command-line tools). Every toolchain
# — Neo4j, Keycloak, Python, Node, pnpm — runs inside containers.
#
# Run `make` with no target to see this list.

# --env-file is required: with -f pointing into infra/, compose would otherwise
# treat infra/ as the project directory and look for infra/.env instead of the
# repo-root .env, silently ignoring every override there (NEO4J_PASSWORD,
# KEYCLOAK_CLIENT_SECRET, AUTH_SECRET, ...) in favor of in-file fallback defaults.
COMPOSE := docker compose -f infra/docker-compose.yml --env-file .env

# Layers infra/docker-compose.tunnel.yml on top — strictly additive (see that
# file's header comment). COMPOSE / the plain `up`/`up-web` targets above never
# use this, so they stay the localhost-only, tunnel-untouched path unconditionally.
TUNNEL_COMPOSE := docker compose -f infra/docker-compose.yml -f infra/docker-compose.tunnel.yml --env-file .env

.DEFAULT_GOAL := help
.PHONY: help up up-web down build clean logs ps check test test-ingest test-web test-web-headed up-tunnel down-tunnel logs-tunnel deploy deploy-clean deploy-sync

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

up:  ## Bring the stack up (Neo4j + Keycloak + API), hot reload. Ctrl+C stops.
	$(COMPOSE) up --build

up-web:  ## Same as up, plus the Next.js web app (needs apps/web scaffolded)
	$(COMPOSE) --profile web up --build

down:  ## Stop everything (including the web/ingest/tunnel profiles, if running)
	$(TUNNEL_COMPOSE) --profile web --profile ingest --profile tunnel down

build:  ## Rebuild all images from scratch (no cache) and recreate containers
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate

# Uses TUNNEL_COMPOSE, not COMPOSE, even though this is meant to be a clean
# slate for the plain (non-tunnel) path. Found by testing: if a prior session
# ends abnormally while the tunnel is up (a script's early exit, Ctrl-C), the
# cloudflared container is defined only in docker-compose.tunnel.yml — a plain
# COMPOSE-scoped teardown never reaches it, so it keeps running orphaned. The
# next `make up-tunnel` then sees it already "Running" and never re-emits its
# startup logs, which looks like a hung/broken tunnel but is actually stale
# state from a `clean` that wasn't actually clean. TUNNEL_COMPOSE is a strict
# superset here — it still tears down the base stack correctly when the
# tunnel was never touched, and additionally catches cloudflared when it was.
clean:  ## Stop and wipe data volumes + built images (fresh slate, all profiles incl. tunnel)
	$(TUNNEL_COMPOSE) --profile web --profile ingest --profile tunnel down -v --rmi local

logs:  ## Tail logs from all running services
	$(COMPOSE) logs -f

ps:  ## Show running services
	$(COMPOSE) ps

check:  ## Report the active LLM mode and whether it's usable (key / subscription)
	$(COMPOSE) --profile ingest run --rm --no-deps ingest \
	  uv run python -m cip_ingest.preflight --validate

test:  ## Run the API test suite in the api container
	$(COMPOSE) run --rm --no-deps api uv run pytest

test-ingest:  ## Run the ingestion test suite in the ingest container
	$(COMPOSE) --profile ingest run --rm --no-deps ingest uv run pytest

test-web:  ## Run all web tests: vitest unit + Playwright e2e (needs `make up-web` running first, host pnpm/Playwright — not containerized). Pass ARGS="--headed" to watch the browser, or use test-web-headed.
	pnpm --filter web test
	pnpm --filter web e2e $(ARGS)

test-web-headed:  ## Same as test-web, but Playwright runs headed and slowed down (PLAYWRIGHT_SLOW_MO=500ms) so you can actually watch it
	PLAYWRIGHT_SLOW_MO=500 $(MAKE) test-web ARGS=--headed

up-tunnel:  ## Same as up-web, plus a public Cloudflare Tunnel preview — three cip-preview-*.sploosh.ai hostnames (web, auth, neo4j); needs TUNNEL_TOKEN in .env — see docs/runbook.md
	$(TUNNEL_COMPOSE) --profile web --profile tunnel up --build

down-tunnel:  ## Stop the tunnel AND revert web/keycloak to local-only config (they keep running, recreated against the base compose file — not just "cloudflared removed")
	$(TUNNEL_COMPOSE) --profile web --profile tunnel stop cloudflared
	$(TUNNEL_COMPOSE) --profile web --profile tunnel rm -f cloudflared
	$(COMPOSE) --profile web up -d --force-recreate web keycloak

logs-tunnel:  ## Tail the tunnel container's logs (connection status, routed requests)
	$(TUNNEL_COMPOSE) --profile web --profile tunnel logs -f cloudflared

# ORACLE_VM_IP comes from .env (not this file) — see .env.example. Read with
# grep, not by sourcing .env as shell, since .env isn't guaranteed to be
# shell-safe (quoting, spaces) even though it's valid for docker's
# --env-file parsing.
ORACLE_VM_IP := $(shell grep -m1 '^ORACLE_VM_IP=' .env 2>/dev/null | cut -d= -f2-)

deploy:  ## Ship latest code to the Oracle Cloud VM — rebuilds web+api only, tunnel/Neo4j/Keycloak stay up the whole time. Needs ORACLE_VM_IP in .env
	@test -n "$(ORACLE_VM_IP)" || { echo "Set ORACLE_VM_IP in .env — see .env.example" >&2; exit 1; }
	./scripts/deploy/deploy-to-oracle.sh $(ORACLE_VM_IP) --up

deploy-clean:  ## Full fresh-slate deploy to the Oracle Cloud VM — wipes ALL volumes (Neo4j data included) and restarts everything, including the tunnel. Real downtime — only for first-time setup or an intentional data reset, not routine code ships
	@test -n "$(ORACLE_VM_IP)" || { echo "Set ORACLE_VM_IP in .env — see .env.example" >&2; exit 1; }
	./scripts/deploy/deploy-to-oracle.sh $(ORACLE_VM_IP) --clean

deploy-sync:  ## Sync latest code + .env to the Oracle Cloud VM WITHOUT rebuilding/restarting anything there
	@test -n "$(ORACLE_VM_IP)" || { echo "Set ORACLE_VM_IP in .env — see .env.example" >&2; exit 1; }
	./scripts/deploy/deploy-to-oracle.sh $(ORACLE_VM_IP)
