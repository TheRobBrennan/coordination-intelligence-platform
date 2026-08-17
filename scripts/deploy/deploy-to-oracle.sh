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
#   ./scripts/deploy/deploy-to-oracle.sh <PUBLIC_IP> [--up]
#
#   <PUBLIC_IP>   The VM's public IPv4 address from the OCI Console.
#   --up          After syncing, SSH in and run `make clean && make up-tunnel`.
#                 Without this flag, the script only syncs the code + .env —
#                 useful for re-syncing after a code change without a full
#                 clean/rebuild.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

HOST="${1:-}"
[ -n "$HOST" ] || { echo "Usage: $0 <PUBLIC_IP> [--up]" >&2; exit 1; }
shift || true

BRING_UP=0
for arg in "$@"; do
  case "$arg" in
    --up) BRING_UP=1 ;;
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

if [ "$BRING_UP" -eq 1 ]; then
  echo "==> Bringing the stack up on the VM (make clean && make up-tunnel)..."
  $SSH "cd $REMOTE_DIR && make clean && make up-tunnel"
else
  echo "Sync only (no --up passed). To bring the stack up:"
  echo "  ssh -i $KEY $USER@$HOST"
  echo "  cd $REMOTE_DIR && make clean && make up-tunnel"
fi
