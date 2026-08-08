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
.PHONY: help up up-web down build clean logs ps check test test-ingest test-web test-web-headed up-tunnel down-tunnel logs-tunnel

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

up:  ## Bring the stack up (Neo4j + Keycloak + API), hot reload. Ctrl+C stops.
	$(COMPOSE) up --build

up-web:  ## Same as up, plus the Next.js web app (needs apps/web scaffolded)
	$(COMPOSE) --profile web up --build

down:  ## Stop everything (including the web/ingest profiles, if running)
	$(COMPOSE) --profile web --profile ingest down

build:  ## Rebuild all images from scratch (no cache) and recreate containers
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate

clean:  ## Stop and wipe data volumes + built images (fresh slate, all profiles)
	$(COMPOSE) --profile web --profile ingest down -v --rmi local

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

up-tunnel:  ## Same as up-web, plus a public Cloudflare Tunnel preview at cip-preview-web/auth.sploosh.ai (needs TUNNEL_TOKEN in .env — see docs/runbook.md)
	$(TUNNEL_COMPOSE) --profile web --profile tunnel up --build

down-tunnel:  ## Stop and remove just the tunnel container — web/api/etc keep running, base stack untouched
	$(TUNNEL_COMPOSE) stop cloudflared
	$(TUNNEL_COMPOSE) rm -f cloudflared

logs-tunnel:  ## Tail the tunnel container's logs (connection status, routed requests)
	$(TUNNEL_COMPOSE) logs -f cloudflared
