#!/usr/bin/env bash
# =============================================================================
# Zero-downtime-ish deploy for the Growasy stack on a single VPS.
#
#   ./scripts/deploy.sh            # deploy the tag in .env (IMAGE_TAG)
#   IMAGE_TAG=sha-abc123 ./scripts/deploy.sh   # deploy a specific tag
#
# Flow:  pull images → bring up DB/Redis → run migrations (one-shot)
#        → roll the app containers → verify health → report.
# On any failure it exits non-zero and prints rollback instructions.
# =============================================================================
set -euo pipefail

# Always operate from the repo root (dir that holds docker-compose.yml).
cd "$(dirname "$0")/.."

COMPOSE="docker compose"
HEALTH_URL="http://localhost/api/health"   # via the nginx edge
RETRIES=30
SLEEP=3

log()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

[ -f .env ] || { fail ".env not found — copy .env.example to .env and edit it first."; exit 1; }

# Remember the currently-running images so we can tell the user how to roll back.
PREV_TAG="$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2- || true)"

rollback_hint() {
  fail "Deployment failed."
  cat >&2 <<EOF

  ── Rollback ─────────────────────────────────────────────────────────────
  Re-deploy the previous known-good tag:

      IMAGE_TAG=${PREV_TAG:-<previous-tag>} ./scripts/deploy.sh

  Or inspect what went wrong:

      docker compose ps
      docker compose logs --tail=100 api worker nginx
  ─────────────────────────────────────────────────────────────────────────
EOF
}
trap 'rollback_hint' ERR

# 1) Pull the latest images (no-op / skipped for locally-built images).
log "Pulling images…"
$COMPOSE pull --quiet mysql redis api worker nginx || log "pull skipped (building locally?)"

# 2) Bring up stateful services first and wait for them to be healthy.
log "Starting database + redis…"
$COMPOSE up -d mysql redis
log "Waiting for MySQL to be healthy…"
for i in $(seq 1 "$RETRIES"); do
  status="$($COMPOSE ps mysql --format '{{.Health}}' 2>/dev/null || echo '')"
  [ "$status" = "healthy" ] && break
  sleep "$SLEEP"
  [ "$i" -eq "$RETRIES" ] && { fail "MySQL never became healthy."; exit 1; }
done
ok "MySQL healthy."

# 3) Run schema migrations as a one-shot (never on app start → no scale race).
log "Running Prisma migrations…"
$COMPOSE run --rm --no-deps api npx prisma migrate deploy
ok "Migrations applied."

# 4) Roll the application + edge containers.
log "Starting/refreshing app containers…"
$COMPOSE up -d --remove-orphans

# 5) Verify the edge → API health endpoint.
log "Verifying health at ${HEALTH_URL}…"
for i in $(seq 1 "$RETRIES"); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    ok "API is healthy."
    trap - ERR
    log "Deployed. Container status:"
    $COMPOSE ps
    exit 0
  fi
  sleep "$SLEEP"
done

fail "Health check did not pass in time."
exit 1
