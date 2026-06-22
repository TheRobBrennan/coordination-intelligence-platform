# Convenience wrapper around docker compose. The ONLY prerequisite is Docker
# Desktop (make ships with macOS / the Xcode command-line tools). Every toolchain
# — Neo4j, Keycloak, Python, Node, pnpm — runs inside containers.
#
#   make up        bring the whole stack up (Neo4j + Keycloak + API), hot reload
#   make up-web    same, plus the Next.js web app (needs apps/web scaffolded)
#   make down      stop everything
#   make build     rebuild images from scratch (no cache) + recreate
#   make clean     stop and wipe data volumes + built images (fresh slate)
#   make logs      tail logs from all services
#   make ps        show running services
#   make test      run the API test suite inside the api container

COMPOSE := docker compose -f infra/docker-compose.yml

.PHONY: up up-web down build clean logs ps test

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

up-web:
	$(COMPOSE) --profile web up --build

build:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate

clean:
	$(COMPOSE) down -v --rmi local

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

test:
	$(COMPOSE) run --rm --no-deps api uv run pytest
