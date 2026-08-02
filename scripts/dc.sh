#!/usr/bin/env bash
# =============================================================================
# One entry point for both Docker stacks, so switching never means editing files.
# (POSIX twin of scripts/dc.ps1 — same arguments, for Linux/macOS/Git Bash.)
#
#   ./scripts/dc.sh dev  up -d          # start the dev stack (hot reload)
#   ./scripts/dc.sh dev  logs -f api    # follow the API logs
#   ./scripts/dc.sh dev  down           # stop it (data volumes are kept)
#   ./scripts/dc.sh prod up -d          # the production stack, same syntax
#
# Everything after the stack name is passed straight through to `docker compose`.
#
#   dev  -> docker-compose.dev.yml   (project: growasy-dev)
#   prod -> docker-compose.yml       (project: growasy, reads .env)
# =============================================================================
set -euo pipefail

# Always operate from the repo root (the directory holding the compose files).
cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<'EOF'
Usage: ./scripts/dc.sh <dev|prod> <docker compose args...>
  e.g. ./scripts/dc.sh dev up -d
       ./scripts/dc.sh dev logs -f api
       ./scripts/dc.sh prod ps
EOF
  exit 1
}

[ $# -ge 2 ] || usage
command -v docker >/dev/null 2>&1 || { echo "docker not found on PATH." >&2; exit 1; }

STACK="$1"; shift

case "$STACK" in
  dev)
    COMPOSE_FILE=docker-compose.dev.yml
    ;;
  prod)
    COMPOSE_FILE=docker-compose.yml
    [ -f .env ] || { echo ".env not found — cp .env.example .env and edit it first." >&2; exit 1; }
    ;;
  *)
    usage
    ;;
esac

printf '\033[1;36m▸ [%s] docker compose -f %s %s\033[0m\n' "$STACK" "$COMPOSE_FILE" "$*"
exec docker compose -f "$COMPOSE_FILE" "$@"
