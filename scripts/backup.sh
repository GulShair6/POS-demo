#!/usr/bin/env sh
set -eu
backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/atlas-pos-$timestamp.sql.gz"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges | gzip -9 > "$file"
echo "$file"
