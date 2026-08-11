#!/usr/bin/env sh
set -eu
if [ "$#" -ne 1 ]; then echo "Usage: ./scripts/restore.sh backups/atlas-pos-TIMESTAMP.sql.gz" >&2; exit 2; fi
file="$1"
if [ ! -f "$file" ]; then echo "Backup not found: $file" >&2; exit 2; fi
gzip -dc "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
