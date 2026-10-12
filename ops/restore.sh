#!/usr/bin/env bash
# Restores a backup made by ops/backup.sh, replacing the current data.
#
#   ops/restore.sh ~/backups/streetboardman-YYYY-MM-DD.sql.gz
#
# Also restores that day's evidence photos
# (streetboardman-YYYY-MM-DD.uploads.tar.gz) when the file is there, so
# results and their photos come back from the same point in time.
# Stops api and worker first so nothing writes mid-restore, and asks for
# confirmation because everything since the backup is lost.
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:?usage: ops/restore.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
UPLOADS_FILE="${FILE%.sql.gz}.uploads.tar.gz"

echo "Database: $FILE"
if [ -f "$UPLOADS_FILE" ]; then
  echo "Photos:   $UPLOADS_FILE"
else
  echo "Photos:   no matching uploads archive; current photos are left as they are"
fi
read -r -p "Replace ALL current data with this backup? Type 'restore' to continue: " answer
[ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }

docker compose stop api worker
gunzip -c "$FILE" | docker compose exec -T postgres psql -U postgres -d streetboardman -v ON_ERROR_STOP=1 --quiet
if [ -f "$UPLOADS_FILE" ]; then
  # Empty the volume first so photos uploaded after the backup don't
  # linger without a database row pointing at them.
  docker compose run --rm --no-deps -T --entrypoint sh api \
    -c 'find /app/uploads -mindepth 1 -delete && tar -C /app -xzf -' < "$UPLOADS_FILE"
fi
docker compose start api worker
docker compose ps
