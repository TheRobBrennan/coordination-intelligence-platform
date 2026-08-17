#!/usr/bin/env bash
#
# Ships this repo (including .env) to the Oracle Cloud VM over SSH, then
# optionally brings the tunnel-enabled stack up there.
#
# Assumes:
#   - The VM already exists and cloud-init (infra/oracle-cloud/cloud-init.yaml)
#     has finished running (creates the `cipdeploy` user, installs Docker).
#   - ~/.ssh/cip_oracle_deploy is the private key matching the pubkey baked
#     into that cloud-init script.
#
# Usage:
#   ./scripts/deploy/deploy-to-oracle.sh <PUBLIC_IP> [--up | --clean]
#
#   <PUBLIC_IP>   The VM's public IPv4 address from the OCI Console.
#   --up          After syncing, rebuild + recreate ONLY web and api —
#                 the two services that actually contain app code. Neo4j,
#                 Keycloak, Postgres, and cloudflared are left completely
#                 untouched, so the tunnel and the graph data survive the
#                 whole redeploy. This is what you want for routine code
#                 changes (the normal case — this is what `make deploy` uses).
#   --clean       After syncing, full fresh-slate bring-up: `make clean`
#                 (wipes ALL volumes, including Neo4j data) then starts
#                 every service from scratch. Real downtime — the tunnel
#                 drops and the graph goes empty until reseeded. Only use
#                 this for first-time setup or when you actually want a
#                 data reset, not for a routine "ship my code" deploy.
#                 Without either flag, the script only syncs the code +
#                 .env and does nothing else.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

HOST="${1:-}"
[ -n "$HOST" ] || { echo "Usage: $0 <PUBLIC_IP> [--up | --clean]" >&2; exit 1; }
shift || true

MODE="sync"
for arg in "$@"; do
  case "$arg" in
    --up) MODE="up" ;;
    --clean) MODE="clean" ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

KEY="$HOME/.ssh/cip_oracle_deploy"
USER="cipdeploy"
REMOTE_DIR="/home/$USER/coordination-intelligence-platform"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new $USER@$HOST"

[ -f "$KEY" ] || { echo "Missing deploy key at $KEY — see docs/plans/2026.08.17/oracle-cloud-deploy.md" >&2; exit 1; }
[ -f .env ] || { echo "No .env in repo root — nothing to deploy" >&2; exit 1; }

echo "==> Waiting for SSH on $HOST..."
for i in $(seq 1 30); do
  $SSH -o ConnectTimeout=5 true 2>/dev/null && break
  sleep 2
  [ "$i" -eq 30 ] && { echo "Timed out waiting for SSH" >&2; exit 1; }
done
echo "SSH is up."

echo "==> Confirming Docker is installed on the VM (cloud-init finished)..."
$SSH "docker --version && docker compose version" || {
  echo "Docker not ready yet — cloud-init may still be running. Wait a minute and retry." >&2
  exit 1
}

echo "==> Creating $REMOTE_DIR..."
$SSH "mkdir -p $REMOTE_DIR"

echo "==> Syncing repo (excluding node_modules, .git, build artifacts, secrets already handled separately)..."
rsync -az --delete \
  -e "ssh -i $KEY" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '**/node_modules' \
  --exclude '.next' \
  --exclude '__pycache__' \
  --exclude '.env' \
  ./ "$USER@$HOST:$REMOTE_DIR/"

echo "==> Syncing .env separately (never logged, never in the excluded-diff output above)..."
scp -i "$KEY" .env "$USER@$HOST:$REMOTE_DIR/.env"

echo "==> Code + .env are on the VM at $REMOTE_DIR"

# Deliberately never `make up-tunnel` / plain `docker compose up` (no -d) —
# that runs attached. Found by testing: over SSH, anything that closes the
# session's stdin (the client disconnects, a wrapping script dies, even
# indirectly) makes an attached compose treat that as a shutdown signal and
# gracefully stop every container in the project — looks fine, then
# `docker ps` comes back empty seconds later. Always start detached.
TUNNEL_COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.tunnel.yml --env-file .env --profile web --profile tunnel"

case "$MODE" in
  up)
    echo "==> Rebuilding web + api on the VM (tunnel, Neo4j, and Keycloak stay up)..."
    $SSH "cd $REMOTE_DIR && $TUNNEL_COMPOSE up -d --build web api"
    ;;
  clean)
    echo "==> Full clean-slate bring-up on the VM (this drops the tunnel and wipes Neo4j data)..."
    $SSH "cd $REMOTE_DIR && make clean && $TUNNEL_COMPOSE up -d --build"
    ;;
  sync)
    echo "Sync only (no --up/--clean passed). To redeploy code with no downtime:"
    echo "  ssh -i $KEY $USER@$HOST"
    echo "  cd $REMOTE_DIR && $TUNNEL_COMPOSE up -d --build web api"
    ;;
esac
