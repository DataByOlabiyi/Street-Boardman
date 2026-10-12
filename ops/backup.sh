#!/usr/bin/env bash
# Daily backup (cron, 02:00) into ~/backups, keeping 14 days:
#   streetboardman-YYYY-MM-DD.sql.gz          the database (pg_dump)
#   streetboardman-YYYY-MM-DD.uploads.tar.gz  evidence photos (uploads volume)
# Backups live on this VM; copy them off regularly.
#
# Restore: ops/restore.sh ~/backups/streetboardman-YYYY-MM-DD.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="$HOME/backups"
STAMP="$(date +%F)"
DB_TARGET="$BACKUP_DIR/streetboardman-$STAMP.sql.gz"
UPLOADS_TARGET="$BACKUP_DIR/streetboardman-$STAMP.uploads.tar.gz"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Dumps as the owner role inside the postgres container (local socket
# auth), so no password is needed or exposed on the command line.
# Written to a temp file first so a failed dump never replaces a good one.
docker compose exec -T postgres pg_dump -U postgres --clean --if-exists streetboardman | gzip > "$DB_TARGET.tmp"
mv "$DB_TARGET.tmp" "$DB_TARGET"
chmod 600 "$DB_TARGET"

# Evidence photos (FEAT-042) live in the api's uploads volume, not the
# database. A throwaway api container mounts the volume and tars it, so
# this works whether or not the api is running.
docker compose run --rm --no-deps -T --entrypoint tar api -C /app -czf - uploads > "$UPLOADS_TARGET.tmp"
mv "$UPLOADS_TARGET.tmp" "$UPLOADS_TARGET"
chmod 600 "$UPLOADS_TARGET"

find "$BACKUP_DIR" -name 'streetboardman-*' -mtime +14 -delete
echo "$(date -Is) backup ok: $DB_TARGET ($(du -h "$DB_TARGET" | cut -f1)), $UPLOADS_TARGET ($(du -h "$UPLOADS_TARGET" | cut -f1))"
