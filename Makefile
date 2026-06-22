# Convenience wrapper around docker compose. The ONLY prerequisite is Docker
# Desktop (make ships with macOS / the Xcode command-line tools). Every toolchain
# — Neo4j, Keycloak, Python, Node, pnpm — runs inside containers.
#
# Run `make` with no target to see this list.

COMPOSE := docker compose -f infra/docker-compose.yml

.DEFAULT_GOAL := help
.PHONY: help up up-web down build clean logs ps check test test-ingest

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

up:  ## Bring the stack up (Neo4j + Keycloak + API), hot reload. Ctrl+C stops.
	$(COMPOSE) up --build

up-web:  ## Same as up, plus the Next.js web app (needs apps/web scaffolded)
	$(COMPOSE) --profile web up --build

down:  ## Stop everything
	$(COMPOSE) down

build:  ## Rebuild all images from scratch (no cache) and recreate containers
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate

clean:  ## Stop and wipe data volumes + built images (fresh slate)
	$(COMPOSE) down -v --rmi local

logs:  ## Tail logs from all running services
	$(COMPOSE) logs -f

ps:  ## Show running services
	$(COMPOSE) ps

check:  ## Verify the LLM API key is set & valid (writes a help file if not)
	$(COMPOSE) --profile ingest run --rm --no-deps ingest \
	  uv run python -m cip_ingest.preflight --validate

test:  ## Run the API test suite in the api container
	$(COMPOSE) run --rm --no-deps api uv run pytest

test-ingest:  ## Run the ingestion test suite in the ingest container
	$(COMPOSE) --profile ingest run --rm --no-deps ingest uv run pytest
