#!/usr/bin/env bash
# =============================================================================
# MySQL backup — timestamped, gzipped, 14-backup retention.
#
#   ./scripts/backup.sh                 # write to ./backups/
#   BACKUP_DIR=/mnt/backups ./scripts/backup.sh
#
# Runs mysqldump INSIDE the mysql container using the container's own env, so no
# DB password is ever read into this script or the host process list.
# Add off-site copies via the optional BACKUP_UPLOAD_CMD hook (see below).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${RETENTION:-14}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/growasy-${TS}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "▸ Dumping database → ${OUT}"
# --single-transaction: consistent snapshot without locking (InnoDB).
# The mysql container already has $MYSQL_ROOT_PASSWORD / $MYSQL_DATABASE in env.
$COMPOSE exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
      --single-transaction --quick --routines --triggers --events \
      "$MYSQL_DATABASE"' \
  | gzip -9 > "$OUT"

# Fail loudly if the dump is suspiciously small (e.g. auth failed → empty file).
if [ "$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")" -lt 1000 ]; then
  echo "✗ Backup looks empty — aborting and removing ${OUT}" >&2
  rm -f "$OUT"
  exit 1
fi
echo "✓ Backup written ($(du -h "$OUT" | cut -f1))"

# Retention: keep only the newest $RETENTION dumps.
echo "▸ Pruning old backups (keeping ${RETENTION})…"
ls -1t "${BACKUP_DIR}"/growasy-*.sql.gz 2>/dev/null | tail -n +"$((RETENTION + 1))" | xargs -r rm -f

# Optional off-site upload hook. Set BACKUP_UPLOAD_CMD in the environment, e.g.:
#   export BACKUP_UPLOAD_CMD='rclone copy "$1" r2:growasy-backups'
#   export BACKUP_UPLOAD_CMD='aws s3 cp "$1" s3://growasy-backups/'
if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  echo "▸ Uploading off-site…"
  bash -c "$BACKUP_UPLOAD_CMD" _ "$OUT"
  echo "✓ Uploaded."
fi

echo "✓ Done."
