#!/usr/bin/env bash
# Deploy the committed HEAD's camis-php-oyl app to DreamHost shared hosting.
#
# Config comes from env vars or OYL_DH_* keys in the UNTRACKED root .env —
# never hard-code host/user/paths here: this file is git-tracked.
#
# Usage: pnpm deploy:dreamhost [--dry-run]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/camis-php-oyl"
DRY_RUN=0
if [[ $# -gt 0 ]]; then
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "deploy-dreamhost: unknown argument '$1' (only --dry-run is supported)." >&2; exit 1 ;;
  esac
  if [[ $# -gt 1 ]]; then
    echo "deploy-dreamhost: too many arguments." >&2
    exit 1
  fi
fi

# Read KEY from the environment (set, even if empty, wins), else from the root .env
# (specific keys only — .env holds unrelated credentials and must never be sourced wholesale).
env_key() {
  local key="$1" val
  if [[ -n "${!key+x}" ]]; then
    printf '%s' "${!key}"
    return
  fi
  val=""
  if [[ -f "$REPO_ROOT/.env" ]]; then
    val="$(grep -E "^${key}=" "$REPO_ROOT/.env" | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
    val="${val%\"}"; val="${val#\"}"
  fi
  printf '%s' "$val"
}

DH_SSH="$(env_key OYL_DH_SSH)"
APP_ROOT="$(env_key OYL_DH_APP_ROOT)"; APP_ROOT="${APP_ROOT:-oyl}"
SITE_URL="$(env_key OYL_DH_SITE_URL)"

if [[ -z "$DH_SSH" ]]; then
  cat >&2 <<'EOF'
deploy-dreamhost: OYL_DH_SSH is not set.
Add these lines to the untracked root .env (or export them in your shell):
  OYL_DH_SSH=<user>@<dreamhost-server>
  # optional overrides:
  OYL_DH_APP_ROOT=oyl                      # relative to the SSH user's home
  OYL_DH_SITE_URL=https://api.example.com  # enables the external health check
EOF
  exit 1
fi

cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "deploy-dreamhost: working tree is dirty — commit or stash first (deploys ship committed HEAD only)." >&2
  exit 1
fi
if [[ ! -f "$APP_DIR/laravel/artisan" ]]; then
  echo "deploy-dreamhost: apps/camis-php-oyl/laravel is not built — run 'pnpm php-app build' first." >&2
  exit 1
fi

SHORT="$(git rev-parse --short HEAD)"

echo "==> Preflight: ssh $DH_SSH"
ssh -o BatchMode=yes -o ConnectTimeout=8 "$DH_SSH" 'command -v php composer >/dev/null' \
  || { echo "deploy-dreamhost: cannot ssh to $DH_SSH, or php/composer missing on the host." >&2; exit 1; }

# The generated app is rebuilt from committed inputs so what ships matches HEAD.
echo "==> Building laravel/ from HEAD ($SHORT)"
pnpm --filter @oyl/camis-php-oyl build >/dev/null
printf 'sha=%s\ndeployed_utc=%s\n' "$(git rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$APP_DIR/laravel/DEPLOYED"

# vendor/ is installed on the host (platform-matched); .env and the sqlite files never ship.
RSYNC_FLAGS=(-a --delete --exclude vendor/ --exclude node_modules/ --exclude '.env' --exclude 'database/*.sqlite' --exclude 'storage/logs/' --exclude 'storage/framework/cache/' --exclude 'bootstrap/cache/' --exclude 'storage/app/')

if [[ $DRY_RUN -eq 1 ]]; then
  echo "==> DRY RUN: rsync delta ($SHORT -> $DH_SSH:$APP_ROOT/laravel); nothing will change"
  rsync -n -i "${RSYNC_FLAGS[@]}" "$APP_DIR/laravel"/ "$DH_SSH:$APP_ROOT/laravel"/
  echo "==> DRY RUN complete; no remote steps executed."
  exit 0
fi

echo "==> Syncing laravel/ -> $DH_SSH:$APP_ROOT/laravel"
ssh "$DH_SSH" "mkdir -p $(printf %q "$APP_ROOT")/laravel"
rsync "${RSYNC_FLAGS[@]}" "$APP_DIR/laravel"/ "$DH_SSH:$APP_ROOT/laravel"/

echo "==> Remote composer + migrate + seed + cache"
ssh "$DH_SSH" "APP_ROOT=$(printf %q "$APP_ROOT") bash -l -s" <<'REMOTE'
set -euo pipefail
cd "$APP_ROOT/laravel"
[ -f .env ] || { echo "remote: laravel/.env missing — create it from apps/camis-php-oyl/.env.example first"; exit 1; }
composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan db:seed --class=RolePermissionSeeder --force
php artisan config:cache
cat DEPLOYED
REMOTE

if [[ -n "$SITE_URL" ]]; then
  echo "==> Health: $SITE_URL/api/_health"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/api/_health" || true)"
  [[ "$code" == "204" ]] || { echo "deploy-dreamhost: health check returned HTTP $code." >&2; exit 1; }
  echo "api is up."
fi

echo "==> Deployed $SHORT to $DH_SSH:$APP_ROOT."
