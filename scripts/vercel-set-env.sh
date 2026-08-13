#!/usr/bin/env bash
# After `npx vercel login` and `npx vercel link`, push env vars from .env.supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env.supabase ]] || { echo "Missing .env.supabase"; exit 1; }
set -a
# shellcheck disable=SC1091
source .env.supabase
set +a

add() {
  local key="$1" value="$2"
  printf '%s' "$value" | npx --yes vercel@39 env add "$key" production --force >/dev/null
  printf '%s' "$value" | npx --yes vercel@39 env add "$key" preview --force >/dev/null
  echo "set $key"
}

add DATABASE_URL "$DATABASE_URL_POOLER"
add DB_POOL_SIZE "1"
add DATABASE_PREPARE "false"
add DATABASE_SSL "true"
add SESSION_SECRET "$SESSION_SECRET"
add ADMIN_NAME "$ADMIN_NAME"
add ADMIN_EMAIL "$ADMIN_EMAIL"
add ADMIN_PASSWORD "$ADMIN_PASSWORD"
add POS_BUSINESS_NAME "$POS_BUSINESS_NAME"
add POS_STORE_NAME "$POS_STORE_NAME"
add POS_REGISTER_CODE "$POS_REGISTER_CODE"
add POS_CURRENCY "$POS_CURRENCY"
add POS_LOCALE "$POS_LOCALE"
add POS_TAX_RATE "$POS_TAX_RATE"
add SEED_DEMO_DATA "false"
echo "Env vars set. Run: npx vercel@39 --prod"
