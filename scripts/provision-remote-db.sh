#!/usr/bin/env bash
# Apply migrations + seed against a remote Postgres (Supabase direct / session URL).
# Usage:
#   DIRECT_DATABASE_URL='postgres://...' ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/provision-remote-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DIRECT_DATABASE_URL:-${DATABASE_URL:-}}" ]]; then
  echo "Set DIRECT_DATABASE_URL (preferred) or DATABASE_URL to the Supabase direct/session connection string." >&2
  exit 1
fi

export DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"
export DATABASE_PREPARE="${DATABASE_PREPARE:-true}"
export DB_POOL_SIZE="${DB_POOL_SIZE:-1}"
export SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}"
export ADMIN_NAME="${ADMIN_NAME:-Atlas Owner}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-owner@example.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
export SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -base64 48)}"

echo "Migrating…"
npm run db:migrate
echo "Seeding…"
npm run db:seed
echo "Done. Use the Transaction pooler URL (port 6543) as DATABASE_URL on Vercel."
