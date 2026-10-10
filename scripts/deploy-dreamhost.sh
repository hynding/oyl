#!/usr/bin/env bash
# Deploy the committed HEAD to DreamHost from a developer machine: the static app (www) and
# the PHP API (api). CI runs the same scripts/dreamhost/publish-*.sh; this wrapper only
# resolves config, checks the tree, builds, and delegates.
#
# Config comes from env vars or OYL_DH_* keys in the UNTRACKED root .env —
# never hard-code host/user/paths here: this file is git-tracked.
#
# Usage: pnpm deploy:dreamhost [--dry-run] [--only www|api]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --only)
      if [[ $# -lt 2 ]]; then echo "deploy-dreamhost: --only needs www or api." >&2; exit 1; fi
      case "$2" in
        www|api) ONLY="$2" ;;
        *) echo "deploy-dreamhost: --only accepts www or api, got '$2'." >&2; exit 1 ;;
      esac
      shift 2 ;;
    *) echo "deploy-dreamhost: unknown argument '$1' (supported: --dry-run, --only www|api)." >&2; exit 1 ;;
  esac
done

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

export DH_SSH="$(env_key OYL_DH_SSH)"
export DH_WWW_ROOT="$(env_key OYL_DH_WWW_ROOT)"
export DH_API_ROOT="$(env_key OYL_DH_API_ROOT)"
export DH_API_BASE="$(env_key OYL_DH_API_BASE)"
export DH_SITE_URL="$(env_key OYL_DH_SITE_URL)"
export DH_API_URL="$(env_key OYL_DH_API_URL)"
export DH_CSP_HEADER="$(env_key OYL_DH_CSP_HEADER)"

if [[ -z "$DH_SSH" ]]; then
  cat >&2 <<'EOF'
deploy-dreamhost: OYL_DH_SSH is not set.
Add these lines to the untracked root .env (or export them in your shell):
  OYL_DH_SSH=<user>@<dreamhost-server>
  OYL_DH_WWW_ROOT=domains/<…>/www            # app web dir, relative to the SSH user's home
  OYL_DH_API_ROOT=domains/<…>/camis          # API root; laravel/ lives under it
  OYL_DH_API_BASE=https://<api-domain>/api   # injected into index.html + CSP connect-src
  # optional:
  OYL_DH_SITE_URL=https://<app-domain>       # enables the www health checks
  OYL_DH_API_URL=https://<api-domain>        # enables the api health check
  OYL_DH_CSP_HEADER=Content-Security-Policy-Report-Only   # first deploy only
EOF
  exit 1
fi

DO_WWW=1; DO_API=1
case "$ONLY" in www) DO_API=0 ;; api) DO_WWW=0 ;; esac

cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "deploy-dreamhost: working tree is dirty — commit or stash first (deploys ship committed HEAD only)." >&2
  exit 1
fi

FLAGS=()
[[ $DRY_RUN -eq 1 ]] && FLAGS+=(--dry-run)

# Build everything first (a build failure publishes nothing), then publish api before www, as
# CI does: an additive api change is safe for the old frontend, and a failed api publish
# (e.g. the remote schema check) stops the frontend from shipping.
if [[ $DO_API -eq 1 ]]; then
  echo "==> Building laravel/ from HEAD"
  pnpm php-app build >/dev/null
fi
if [[ $DO_WWW -eq 1 ]]; then
  echo "==> Building the Stencil app (all-of-oyl + ui-oyl + www)"
  pnpm stencil build
fi

# DH_API_ROOT is exported above, so publish-www also gets it (its root-overlap guard).
if [[ $DO_API -eq 1 ]]; then
  bash "$REPO_ROOT/scripts/dreamhost/publish-api.sh" "${FLAGS[@]+"${FLAGS[@]}"}"
fi
if [[ $DO_WWW -eq 1 ]]; then
  bash "$REPO_ROOT/scripts/dreamhost/publish-www.sh" "${FLAGS[@]+"${FLAGS[@]}"}"
fi

echo "==> Done ($(git rev-parse --short HEAD))."
