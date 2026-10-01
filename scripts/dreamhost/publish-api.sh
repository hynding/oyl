#!/usr/bin/env bash
# Publish the BUILT camis-php-oyl Laravel app (apps/camis-php-oyl/laravel) to DreamHost.
# Shared by .github/workflows/deploy.yml and scripts/deploy-dreamhost.sh — all config comes from
# the environment; this file is git-tracked and must never hold a host, user, path or secret.
#
#   DH_SSH       user@host (required)
#   DH_API_ROOT  app root relative to the SSH user's home; laravel/ lives under it (required)
#   DH_API_URL   https://<api-domain> — enables the external /api/_health check (optional)
#
# Usage: publish-api.sh [--dry-run]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/camis-php-oyl"
DRY_RUN=0
if [[ $# -gt 0 ]]; then
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "publish-api: unknown argument '$1' (only --dry-run is supported)." >&2; exit 1 ;;
  esac
  if [[ $# -gt 1 ]]; then
    echo "publish-api: too many arguments." >&2
    exit 1
  fi
fi

DH_SSH="${DH_SSH:-}"; DH_API_ROOT="${DH_API_ROOT:-}"; DH_API_URL="${DH_API_URL:-}"
missing=()
if [[ -z "$DH_SSH" ]]; then missing+=(DH_SSH); fi
if [[ -z "$DH_API_ROOT" ]]; then missing+=(DH_API_ROOT); fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "publish-api: missing required environment: ${missing[*]} (optional: DH_API_URL)." >&2
  exit 1
fi

if [[ ! -f "$APP_DIR/laravel/artisan" ]]; then
  echo "publish-api: apps/camis-php-oyl/laravel is not built — run 'pnpm php-app build' first." >&2
  exit 1
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8)
SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

# Login shell on purpose: DreamHost selects the per-user CLI PHP through ~/.bash_profile, and
# the remote body below runs under bash -l too — both stages must see the same toolchain.
echo "==> Preflight: ssh $DH_SSH"
# Two separate lookups: `command -v php composer` succeeds when only one of them exists.
ssh "${SSH_OPTS[@]}" "$DH_SSH" 'bash -l -c "command -v php >/dev/null && command -v composer >/dev/null"' \
  || { echo "publish-api: cannot ssh to $DH_SSH, or php/composer missing from the login-shell PATH." >&2; exit 1; }

printf 'sha=%s\ndeployed_utc=%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$APP_DIR/laravel/DEPLOYED"

# vendor/ is installed on the host (platform-matched); .env and the sqlite files never ship.
# public/.well-known/ is DreamHost's (certificate validation in the api docroot); protect it from --delete.
RSYNC_FLAGS=(-a --delete -e 'ssh -o BatchMode=yes' --exclude vendor/ --exclude node_modules/ --exclude '.env' --exclude 'database/*.sqlite' --exclude 'storage/logs/' --exclude 'storage/framework/cache/' --exclude 'bootstrap/cache/' --exclude 'storage/app/' --exclude 'public/.well-known/')

if [[ $DRY_RUN -eq 1 ]]; then
  echo "==> DRY RUN: rsync delta ($SHORT -> $DH_SSH:$DH_API_ROOT/laravel); nothing will change"
  rsync -n -i "${RSYNC_FLAGS[@]}" "$APP_DIR/laravel"/ "$DH_SSH:$DH_API_ROOT/laravel"/
  echo "==> DRY RUN complete; no remote steps executed."
  exit 0
fi

echo "==> Syncing laravel/ -> $DH_SSH:$DH_API_ROOT/laravel"
ssh "${SSH_OPTS[@]}" "$DH_SSH" "mkdir -p $(printf %q "$DH_API_ROOT")/laravel"
rsync "${RSYNC_FLAGS[@]}" "$APP_DIR/laravel"/ "$DH_SSH:$DH_API_ROOT/laravel"/

echo "==> Remote composer + schema check + cache"
ssh "${SSH_OPTS[@]}" "$DH_SSH" "APP_ROOT=$(printf %q "$DH_API_ROOT") bash -l -s" <<'REMOTE'
set -euo pipefail
cd "$APP_ROOT/laravel"
[ -f .env ] || { echo "remote: laravel/.env missing — create it from apps/camis-php-oyl/.env.example first (README 'DreamHost one-time setup')"; exit 1; }
# The HS256 key is shared with the Strapi instance that owns this database; firebase/php-jwt
# refuses anything shorter than 32 bytes, so a placeholder .env would 500 every signed request.
# Length only — the value is never printed. Last assignment wins, as dotenv reads it.
secret_len="$(awk '/^JWT_SECRET=/{v=$0; sub(/^JWT_SECRET=/, "", v); sub(/\r$/, "", v); gsub(/^"|"$/, "", v)} END{print length(v)}' .env)"
[ "${secret_len:-0}" -ge 32 ] || { echo "remote: JWT_SECRET in laravel/.env must be >= 32 bytes — see apps/camis-php-oyl/README.md"; exit 1; }
# The runtime dirs are rsync-excluded, so a first deploy has none of them: recreate (no-op later).
mkdir -p bootstrap/cache storage/logs storage/framework/cache storage/app storage/framework/sessions storage/framework/views
composer install --no-dev --optimize-autoloader --no-interaction
# bootstrap/cache/ is rsync-excluded, so the previous deploy's config:cache is still on the
# host: clear it or the check would read that stale config (e.g. the old database credentials).
php artisan config:clear
# Strapi owns the schema: this fails (listing every missing table/column) until strapi-oyl has
# been booted against this MySQL database — see apps/camis-php-oyl/README.md "Schema sync".
php artisan camis:strapi-schema-check
php artisan config:cache
cat DEPLOYED
REMOTE

if [[ -n "$DH_API_URL" ]]; then
  echo "==> Health: $DH_API_URL/api/_health"
  code="$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' "$DH_API_URL/api/_health" || true)"
  [[ "$code" == "204" ]] || { echo "publish-api: health check returned HTTP $code." >&2; exit 1; }
  echo "api is up."
fi

echo "==> Published $SHORT to $DH_SSH:$DH_API_ROOT."
