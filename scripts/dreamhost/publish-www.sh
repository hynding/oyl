#!/usr/bin/env bash
# Publish the static vanilla-oyl app to DreamHost: stage the four asset roots, inject the API
# base, render .htaccess (scoped SPA fallback + hashed CSP), rsync, health-check.
# Shared by .github/workflows/deploy.yml and scripts/deploy-dreamhost.sh — all config comes from
# the environment; this file is git-tracked and must never hold a host, user, path or secret.
#
#   DH_SSH         user@host (required)
#   DH_WWW_ROOT    web directory relative to the SSH user's home (required)
#   DH_API_BASE    https://<api-domain>/api — injected into index.html; its origin feeds CSP (required)
#   DH_SITE_URL    https://<app-domain> — enables the external health checks (optional)
#   DH_CSP_HEADER  Content-Security-Policy (default) | Content-Security-Policy-Report-Only
#   DH_WWW_SRC     app source dir (default apps/vanilla-oyl; a test seam)
#
# Usage: publish-www.sh [--dry-run]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DRY_RUN=0
if [[ $# -gt 0 ]]; then
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "publish-www: unknown argument '$1' (only --dry-run is supported)." >&2; exit 1 ;;
  esac
  if [[ $# -gt 1 ]]; then
    echo "publish-www: too many arguments." >&2
    exit 1
  fi
fi

DH_SSH="${DH_SSH:-}"; DH_WWW_ROOT="${DH_WWW_ROOT:-}"; DH_API_BASE="${DH_API_BASE:-}"
DH_SITE_URL="${DH_SITE_URL:-}"
CSP_HEADER="${DH_CSP_HEADER:-Content-Security-Policy}"
SRC="${DH_WWW_SRC:-$REPO_ROOT/apps/vanilla-oyl}"
missing=()
if [[ -z "$DH_SSH" ]]; then missing+=(DH_SSH); fi
if [[ -z "$DH_WWW_ROOT" ]]; then missing+=(DH_WWW_ROOT); fi
if [[ -z "$DH_API_BASE" ]]; then missing+=(DH_API_BASE); fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "publish-www: missing required environment: ${missing[*]} (optional: DH_SITE_URL, DH_CSP_HEADER, DH_WWW_SRC)." >&2
  exit 1
fi
url_re="^https?://[^[:space:]\"'<>]+\$"
if [[ ! "$DH_API_BASE" =~ $url_re ]]; then
  echo "publish-www: DH_API_BASE must be an http(s) URL without quotes or whitespace." >&2
  exit 1
fi
# Trim trailing slashes — config.js normalizes too, but the shipped HTML should already be clean.
while [[ "$DH_API_BASE" == */ ]]; do DH_API_BASE="${DH_API_BASE%/}"; done

if [[ ! -f "$SRC/index.html" ]]; then
  echo "publish-www: $SRC/index.html not found." >&2
  exit 1
fi
if [[ ! -f "$SRC/vendor/all-of-oyl/index.js" ]]; then
  echo "publish-www: $SRC/vendor/all-of-oyl is missing — run 'pnpm vanilla build:lib' first." >&2
  exit 1
fi
if ! grep -q '<meta name="oyl-api-base"' "$SRC/index.html"; then
  echo "publish-www: index.html has no <meta name=\"oyl-api-base\"> — the app would fall back to same-origin /api. Restore the tag." >&2
  exit 1
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8)
SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

echo "==> Preflight: ssh $DH_SSH"
ssh "${SSH_OPTS[@]}" "$DH_SSH" true \
  || { echo "publish-www: cannot ssh to $DH_SSH (check key/agent and known_hosts)." >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Staging index.html, src/, styles/, vendor/ from $SRC (without *.test.js)"
cp "$SRC/index.html" "$STAGE/index.html"
for root in src styles vendor; do
  cp -R "$SRC/$root" "$STAGE/$root"
done
find "$STAGE" -name '*.test.js' -type f -delete

echo "==> Injecting API base: $DH_API_BASE"
node -e '
  const fs = require("fs")
  const [file, base] = process.argv.slice(1)
  const html = fs.readFileSync(file, "utf8")
  const re = /<meta name="oyl-api-base" content="[^"]*"\s*\/?>/
  if (!re.test(html)) { console.error("publish-www: meta tag not found during injection"); process.exit(1) }
  fs.writeFileSync(file, html.replace(re, `<meta name="oyl-api-base" content="${base}" />`))
' "$STAGE/index.html" "$DH_API_BASE"

API_ORIGIN="$(node -e 'console.log(new URL(process.argv[1]).origin)' "$DH_API_BASE")"
echo "==> Rendering .htaccess ($CSP_HEADER; connect-src $API_ORIGIN)"
node "$REPO_ROOT/apps/vanilla-oyl/scripts/render-htaccess.mjs" \
  --html "$STAGE/index.html" --api-origin "$API_ORIGIN" --csp-header "$CSP_HEADER" --out "$STAGE/.htaccess"

printf 'sha=%s\ndeployed_utc=%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGE/DEPLOYED"

# .well-known/ is DreamHost's (certificate validation); protect it from --delete.
RSYNC_FLAGS=(-a --delete --exclude '.well-known/' -e 'ssh -o BatchMode=yes')

if [[ $DRY_RUN -eq 1 ]]; then
  echo "==> DRY RUN: rsync delta ($SHORT -> $DH_SSH:$DH_WWW_ROOT); nothing will change"
  rsync -n -i "${RSYNC_FLAGS[@]}" "$STAGE"/ "$DH_SSH:$DH_WWW_ROOT"/
  echo "==> DRY RUN complete; no remote steps executed."
  exit 0
fi

echo "==> Syncing -> $DH_SSH:$DH_WWW_ROOT"
rsync "${RSYNC_FLAGS[@]}" "$STAGE"/ "$DH_SSH:$DH_WWW_ROOT"/

if [[ -n "$DH_SITE_URL" ]]; then
  echo "==> Health: $DH_SITE_URL"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$DH_SITE_URL/" || true)"
  [[ "$code" == "200" ]] || { echo "publish-www: GET / returned HTTP $code." >&2; exit 1; }
  body="$(curl -s -w '\n%{http_code}' "$DH_SITE_URL/journal" || true)"
  [[ "${body##*$'\n'}" == "200" && "$body" == *'type="importmap"'* ]] \
    || { echo "publish-www: deep link /journal did not serve index.html (SPA fallback broken)." >&2; exit 1; }
  code="$(curl -s -o /dev/null -w '%{http_code}' "$DH_SITE_URL/vendor/does-not-exist.js" || true)"
  [[ "$code" == "404" ]] || { echo "publish-www: missing asset returned HTTP $code, expected 404 (fallback not scoped)." >&2; exit 1; }
  code="$(curl -s -o /dev/null -w '%{http_code}' "$DH_SITE_URL/DEPLOYED" || true)"
  [[ "$code" == "403" ]] || { echo "publish-www: /DEPLOYED returned HTTP $code, expected 403." >&2; exit 1; }
  echo "site is up; SPA fallback scoped; DEPLOYED denied."
fi

echo "==> Published $SHORT to $DH_SSH:$DH_WWW_ROOT."
