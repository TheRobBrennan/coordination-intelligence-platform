#!/usr/bin/env bash
#
# Pre-flight verification for the Kathy demo (and any time after).
# Clean slate -> local login proven -> tunnel up -> tunnel login proven ->
# tunnel down -> tunnel URLs proven actually gone -> local login proven again.
# Ends with the stack running plain (local-only), ready to walk into a meeting.
#
# This is the scripted version of the "Full pre-flight verification" section
# in docs/plans/2026.08.08/kathy-demo.md — same sequence, same reasoning for
# why each step exists. Read that doc for the *why*; this is the *doing*.
#
# For each URL: `open -a Safari` gives you something to actually look at,
# then a Playwright run (headless, using the same e2e/login.spec.ts the repo
# already has) proves sign-in/session/sign-out actually work — not just that
# the page loaded. Looking at it and proving it are different checks; this
# script does both, every time.
#
# Usage:
#   ./scripts/preflight-check.sh            # pauses between stages
#   ./scripts/preflight-check.sh --no-pause  # runs straight through, no Enter needed
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PAUSE=1
for arg in "$@"; do
  case "$arg" in
    --no-pause|-y) PAUSE=0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'

log()  { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$RESET"; }
ok()   { printf '%s✓ %s%s\n' "$GREEN" "$*" "$RESET"; }
warn() { printf '%s! %s%s\n' "$YELLOW" "$*" "$RESET"; }
fail() { printf '%s✗ %s%s\n' "$RED" "$*" "$RESET"; exit 1; }

pause() {
  [ "$PAUSE" -eq 1 ] || return 0
  read -r -p "$(printf '%s— press Enter to continue —%s ' "$YELLOW" "$RESET")"
}

# Waits for $2 (a grep -E pattern) to appear in $1 (a log file), polling every
# 2s up to $3 seconds. Also bails early on common fatal-startup signatures so
# a genuinely broken run fails fast instead of waiting out the full timeout.
wait_for_log() {
  local file="$1" pattern="$2" timeout="${3:-120}" waited=0
  until grep -qE "$pattern" "$file" 2>/dev/null; do
    if grep -qiE "unable to start|fatal|panic|bind: address already in use" "$file" 2>/dev/null; then
      fail "Saw a fatal error in $file — check it directly."
    fi
    waited=$((waited + 2))
    if [ "$waited" -ge "$timeout" ]; then
      fail "Timed out after ${timeout}s waiting for /$pattern/ in $file"
    fi
    sleep 2
  done
}

# Waits for $1 to answer HTTP 200, polling every 2s up to $2 seconds (default
# 60). `docker compose up -d` (what down-tunnel's --force-recreate uses)
# returns once containers *start*, not once Next.js/Keycloak inside them are
# actually serving requests — found by hitting this exact race manually
# (net::ERR_CONNECTION_RESET) running Playwright immediately after down-tunnel.
wait_for_http() {
  local url="$1" timeout="${2:-60}" waited=0
  until [ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null)" = "200" ]; do
    waited=$((waited + 2))
    if [ "$waited" -ge "$timeout" ]; then
      fail "Timed out after ${timeout}s waiting for $url to respond"
    fi
    sleep 2
  done
}

# Runs the existing login.spec.ts against $1, headless. This is the actual
# proof — not "the page loaded," but "sign in, session shows, sign out,
# lands back on the right host" all pass as real assertions.
verify_login() {
  local base_url="$1" label="$2"
  log "Proving login end-to-end against $label ($base_url)"
  ( cd apps/web && PLAYWRIGHT_BASE_URL="$base_url" pnpm exec playwright test e2e/login.spec.ts ) \
    && ok "Login verified on $label" \
    || fail "Login FAILED on $label — see Playwright output above"
}

# Neo4j has its own auth, unrelated to Keycloak — a plain REST call is enough
# to prove the rotated password actually works, no browser needed.
verify_neo4j() {
  local base_url="$1" label="$2"
  log "Checking Neo4j auth on $label"
  local password
  password=$(grep '^NEO4J_PASSWORD=' .env | cut -d= -f2-)
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    -u "neo4j:${password}" -H 'Content-Type: application/json' \
    -d '{"statements":[{"statement":"RETURN 1"}]}' \
    "${base_url}/db/neo4j/tx/commit")
  [ "$code" = "200" ] \
    && ok "Neo4j auth OK on $label (HTTP $code)" \
    || fail "Neo4j auth FAILED on $label (HTTP $code) — check NEO4J_PASSWORD in .env"
}

WEB_LOCAL="http://localhost:3000"
AUTH_LOCAL="http://localhost:8080"
NEO4J_LOCAL="http://localhost:7474"
WEB_TUNNEL="https://cip-preview-web.sploosh.ai"
AUTH_TUNNEL="https://cip-preview-auth.sploosh.ai"
NEO4J_TUNNEL="https://cip-preview-neo4j.sploosh.ai"

UP_LOG=$(mktemp -t cip-preflight-up-web)
TUNNEL_LOG=$(mktemp -t cip-preflight-up-tunnel)

# ── 1. Clean slate ────────────────────────────────────────────────────────
log "Step 1/6 — clean slate (make clean, then make up-web)"
echo "Wipes volumes/images so nothing stale can hide a real bug. Costs nothing"
echo "right now: no data has been ingested yet. Also the only way the rotated"
echo "NEO4J_PASSWORD actually takes effect — it's baked into the volume at"
echo "first init, same as the Keycloak realm."
make clean
( make up-web > "$UP_LOG" 2>&1 & )
wait_for_log "$UP_LOG" 'Ready in' 180
ok "Local stack is up"

open -a Safari "$WEB_LOCAL"
open -a Safari "$NEO4J_LOCAL"
verify_login "$WEB_LOCAL" "localhost"
verify_neo4j "$NEO4J_LOCAL" "localhost"
pause

# ── 2. Tunnel up ──────────────────────────────────────────────────────────
log "Step 2/6 — bring the tunnel up (make up-tunnel)"
( make up-tunnel > "$TUNNEL_LOG" 2>&1 & )
wait_for_log "$TUNNEL_LOG" 'Registered tunnel connection' 120
wait_for_log "$TUNNEL_LOG" 'Ready in' 60
ok "Tunnel is connected"

# "Ready in" only means the process started; Next.js still JIT-compiles each
# route on its first real hit, and this is also the tunnel's first actual
# round-trip through Cloudflare's edge. Found by testing: the very first
# Playwright run against a freshly-connected tunnel timed out waiting for the
# login form (30s) while an identical second run passed in 14s — pure
# cold-start latency, not a code bug. Warm the routes the real test will hit
# before asserting anything, so the timing failure can't recur.
log "Warming up tunnel routes before verifying (cold-start latency, not optional)"
curl -sS -o /dev/null --max-time 15 "$WEB_TUNNEL/" || true
curl -sS -o /dev/null --max-time 15 "$AUTH_TUNNEL/realms/platform" || true
sleep 2

open -a Safari "$WEB_TUNNEL"
open -a Safari "$NEO4J_TUNNEL"
verify_login "$WEB_TUNNEL" "the public tunnel"
verify_neo4j "$NEO4J_TUNNEL" "the public tunnel"
pause

# ── 3. Tunnel down ────────────────────────────────────────────────────────
log "Step 3/6 — spin the tunnel down (make down-tunnel)"
echo "Reverts web/keycloak to local-only config too, not just removing the"
echo "cloudflared container — see docs/runbook.md if this ever seems to only"
echo "half-work again."
make down-tunnel
# Both web AND keycloak get --force-recreate'd here — waiting on just one of
# them isn't enough. Found by testing: web (Next.js dev server) comes up in
# well under a second, but keycloak is a JVM doing a realm import and takes
# noticeably longer — the login flow's redirect *to* Keycloak hit
# ERR_CONNECTION_RESET because only the web app's readiness was checked.
wait_for_http "$WEB_LOCAL" 60
wait_for_http "$AUTH_LOCAL/realms/platform" 60
ok "Tunnel torn down, web/keycloak reverted to local-only and confirmed serving"

# ── 4. Prove the tunnel URLs are actually gone ───────────────────────────
log "Step 4/6 — prove the tunnel URLs are actually gone, not just 'probably down'"
echo "Expect HTTP 530 / \"error code: 1033\" — Cloudflare's own \"tunnel not"
echo "connected\" signature, not a connection failure. DNS still resolves;"
echo "the request reaches Cloudflare's edge and gets turned away there."
for pair in "web:$WEB_TUNNEL" "auth:$AUTH_TUNNEL/realms/platform" "neo4j:$NEO4J_TUNNEL"; do
  name="${pair%%:*}"; url="${pair#*:}"
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo "000")
  if [ "$code" = "200" ]; then
    fail "$name still responding with HTTP 200 after down-tunnel — it should NOT be reachable"
  else
    ok "$name: HTTP $code (expected — tunnel is down)"
  fi
done
open -a Safari "$WEB_TUNNEL"
warn "Safari should show Cloudflare's error page now, not the app. Worth actually seeing once."
pause

# ── 5. Local still works, unaffected by any of the above ────────────────
log "Step 5/6 — confirm localhost is completely unaffected"
open -a Safari "$WEB_LOCAL"
open -a Safari "$NEO4J_LOCAL"
verify_login "$WEB_LOCAL" "localhost (post-tunnel)"
verify_neo4j "$NEO4J_LOCAL" "localhost (post-tunnel)"

# ── 6. Done ───────────────────────────────────────────────────────────────
log "Step 6/6 — resounding applause and more cash in hand"
echo "Not a make target. No test covers this one. Bring your own charm."
ok "Every check passed. Stack is left running local-only — ready to walk in."
