#!/usr/bin/env bash
# =============================================================================
# Restore a gzipped mysqldump into the running MySQL container.
#
#   ./scripts/restore.sh ./backups/growasy-20260101-030000.sql.gz
#
# DESTRUCTIVE: overwrites the current database. Requires typed confirmation.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose"
FILE="${1:-}"

[ -n "$FILE" ] || { echo "Usage: $0 <backup.sql.gz>" >&2; exit 1; }
[ -f "$FILE" ] || { echo "✗ File not found: $FILE" >&2; exit 1; }

echo "⚠  This will OVERWRITE the live database with:"
echo "     $FILE"
read -r -p "Type 'restore' to continue: " confirm
[ "$confirm" = "restore" ] || { echo "Aborted."; exit 1; }

echo "▸ Ensuring MySQL is up…"
$COMPOSE up -d mysql
sleep 3

echo "▸ Restoring…"
# Stream the gunzipped dump into mysql inside the container.
gunzip -c "$FILE" | $COMPOSE exec -T mysql sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'

echo "✓ Restore complete. Restarting app containers…"
$COMPOSE restart api worker
echo "✓ Done."
