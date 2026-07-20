#!/usr/bin/env bash
# Deploy the committed HEAD of this repo to the production Pi.
#
# Config comes from env vars or OYL_PI_* keys in the UNTRACKED root .env —
# never hard-code host/user/IP here: this file is git-tracked.
#
# Usage: pnpm deploy:pi [--dry-run]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# Read KEY from the environment, else from the root .env (specific keys only —
# .env holds unrelated credentials and must never be sourced wholesale).
env_key() {
  local key="$1" val
  val="${!key:-}"
  if [[ -z "$val" && -f "$REPO_ROOT/.env" ]]; then
    val="$(grep -E "^${key}=" "$REPO_ROOT/.env" | tail -1 | cut -d= -f2- || true)"
  fi
  printf '%s' "$val"
}

PI_SSH="$(env_key OYL_PI_SSH)"
APP_ROOT="$(env_key OYL_PI_APP_ROOT)"; APP_ROOT="${APP_ROOT:-/opt/oyl}"
WEB_ROOT="$(env_key OYL_PI_WEB_ROOT)"; WEB_ROOT="${WEB_ROOT:-/var/www/app}"
SITE_URL="$(env_key OYL_PI_SITE_URL)"

if [[ -z "$PI_SSH" ]]; then
  cat >&2 <<'EOF'
deploy-pi: OYL_PI_SSH is not set.
Add these lines to the untracked root .env (or export them in your shell):
  OYL_PI_SSH=<user>@<pi-host>
  # optional overrides:
  OYL_PI_APP_ROOT=/opt/oyl
  OYL_PI_WEB_ROOT=/var/www/app
  OYL_PI_SITE_URL=<public site URL, enables the external health check>
EOF
  exit 1
fi

cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "deploy-pi: working tree is dirty — commit or stash first (deploys ship committed HEAD only)." >&2
  exit 1
fi

SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"

echo "==> Preflight: ssh $PI_SSH"
ssh -o BatchMode=yes -o ConnectTimeout=8 "$PI_SSH" true \
  || { echo "deploy-pi: cannot ssh to $PI_SSH (check key/agent and host)." >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Exporting HEAD ($SHORT)"
git archive HEAD | tar -x -C "$STAGE"
printf 'sha=%s\ndeployed_utc=%s\n' "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGE/DEPLOYED"

# Excluded paths are also protected from --delete on the Pi (installed deps, local env).
RSYNC_FLAGS=(-a --delete --exclude .git/ --exclude node_modules/ --exclude .tmp/ --exclude '.env*')

if [[ $DRY_RUN -eq 1 ]]; then
  echo "==> DRY RUN: rsync delta ($SHORT -> $PI_SSH:$APP_ROOT); nothing will change"
  rsync -n -i "${RSYNC_FLAGS[@]}" "$STAGE"/ "$PI_SSH:$APP_ROOT"/
  echo "==> DRY RUN complete; no remote steps executed."
  exit 0
fi

echo "==> Syncing workspace -> $PI_SSH:$APP_ROOT"
rsync "${RSYNC_FLAGS[@]}" "$STAGE"/ "$PI_SSH:$APP_ROOT"/

SITE_HOST=""
[[ -n "$SITE_URL" ]] && SITE_HOST="$(printf '%s' "$SITE_URL" | sed -E 's#^[a-z]+://##; s#/.*$##')"

echo "==> Remote build + restart + publish + health"
ssh "$PI_SSH" "APP_ROOT=$(printf %q "$APP_ROOT") WEB_ROOT=$(printf %q "$WEB_ROOT") SITE_HOST=$(printf %q "$SITE_HOST") bash -l -s" <<'REMOTE'
set -euo pipefail
cd "$APP_ROOT"
command -v pnpm >/dev/null || { echo "remote: pnpm not on PATH (login shell)"; exit 1; }

echo "--> pnpm install"
pnpm install --frozen-lockfile

echo "--> frontend build (all-of-oyl dist + vendor into app)"
pnpm vanilla build:lib

echo "--> strapi build"
set -a; source /etc/strapi/strapi.env; set +a
pnpm strapi-app build

echo "--> pm2 restart strapi"
pm2 restart strapi --update-env

echo "--> publish frontend -> $WEB_ROOT"
# Only the four asset roots ship; --delete-excluded purges anything else in the
# web root (multi-source rsync --delete would never clean the destination top level).
rsync -a --delete --delete-excluded \
  --include='/index.html' --include='/src/***' --include='/styles/***' --include='/vendor/***' \
  --exclude='*' \
  apps/vanilla-oyl/ "$WEB_ROOT"/

echo "--> regenerate CSP hashes + reload caddy"
sudo /usr/local/bin/oyl-csp.sh

echo "--> health: strapi (schema sync happens during this boot)"
PORT="${PORT:-1337}"
code=000
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/bootstrap" || true)"
  case "$code" in 200|401|403) echo "strapi alive (HTTP $code)"; break;; esac
  if [ "$i" -eq 30 ]; then
    echo "strapi failed to come up (last HTTP $code)"
    pm2 logs strapi --nostream --lines 40 || true
    exit 1
  fi
  sleep 2
done

if [ -n "$SITE_HOST" ]; then
  echo "--> health: caddy loopback ($SITE_HOST)"
  ccode="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $SITE_HOST" http://127.0.0.1/ || true)"
  [ "$ccode" = "200" ] || { echo "caddy loopback returned HTTP $ccode"; exit 1; }
  echo "caddy serving (HTTP 200)"
fi

cat DEPLOYED
REMOTE

if [[ -n "$SITE_URL" ]]; then
  echo "==> Health: $SITE_URL (external, via tunnel)"
  curl -sf -o /dev/null "$SITE_URL" \
    || { echo "deploy-pi: external check of $SITE_URL failed." >&2; exit 1; }
  echo "site is up."
fi

echo "==> Deployed $SHORT to $PI_SSH."
