# Pi Deploy Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command — `pnpm deploy:pi` — that deploys the committed HEAD to the production Pi: rsync the workspace, rebuild both apps, restart Strapi, publish the frontend, regenerate CSP hashes, verify health.

**Architecture:** A single bash script run from the Mac. It exports `git archive HEAD` to a temp dir, rsyncs it to the Pi's workspace root with `--delete`, then runs one fail-fast SSH session for build/restart/publish/health. All connection details come from env vars or `OYL_PI_*` keys in the untracked root `.env` — the tracked script contains no host, user, or IP.

**Tech Stack:** bash, rsync, ssh, pnpm/pm2/Caddy already on the Pi. Spec: `docs/superpowers/specs/2026-07-20-pi-deploy-script-design.md`.

## Global Constraints

- **No secrets or environment-identifying data in tracked files** (this plan included — hence the `<ssh-user>@<pi-lan-ip>` placeholders below; real values live only in the untracked root `.env` and `log/PI_SERVER_SETUP.md`).
- Deploys ship **committed HEAD only**; abort on a dirty tree.
- The workspace deploys **whole** (never an app subdir in isolation — `workspace:*` resolution needs the repo root + lockfile).
- `set -euo pipefail` in every shell context; every abort names the failed step.
- Commit messages end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

### Task 1: `scripts/deploy-pi.sh` + `pnpm deploy:pi` wiring

**Files:**
- Create: `scripts/deploy-pi.sh` (mode 755)
- Modify: `package.json` (root — add one script entry)
- Commit includes: `docs/superpowers/specs/2026-07-20-pi-deploy-script-design.md`, `docs/superpowers/plans/2026-07-20-pi-deploy-script.md` (approved but not yet committed)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `scripts/deploy-pi.sh` accepting optional `--dry-run`; config keys `OYL_PI_SSH` (required, `user@host`), `OYL_PI_APP_ROOT` (default `/opt/oyl`), `OYL_PI_WEB_ROOT` (default `/var/www/app`), `OYL_PI_SITE_URL` (optional), read from environment first, then root `.env`. Exit 0 on success, 1 on any failure.

- [ ] **Step 1: Verify the command doesn't exist yet (failing state)**

Run: `pnpm deploy:pi`
Expected: FAIL — `Command "deploy:pi" not found`.

- [ ] **Step 2: Write the script**

Create `scripts/deploy-pi.sh` with exactly:

```bash
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
ssh "$PI_SSH" "APP_ROOT=$APP_ROOT WEB_ROOT=$WEB_ROOT SITE_HOST=$SITE_HOST bash -l -s" <<'REMOTE'
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
```

Then: `chmod +x scripts/deploy-pi.sh`

- [ ] **Step 3: Wire the root package.json script**

In root `package.json` `"scripts"`, after the `"e2e"` entry, add:

```json
"deploy:pi": "bash scripts/deploy-pi.sh",
```

(`pnpm deploy:pi --dry-run` forwards the flag as `$1`.)

- [ ] **Step 4: Static checks**

Run: `bash -n scripts/deploy-pi.sh` — expected: silence (exit 0).
Run: `command -v shellcheck && shellcheck scripts/deploy-pi.sh || echo "shellcheck not installed — skipped"` — expected: no errors (info/style notes acceptable; fix any warnings about quoting or unset variables).

- [ ] **Step 5: Test the missing-config abort**

The root `.env` does not yet contain `OYL_PI_SSH` (Task 2 adds it).

Run: `pnpm deploy:pi`
Expected: exit 1 with the `deploy-pi: OYL_PI_SSH is not set.` block. Nothing else happens.

- [ ] **Step 6: Test the dirty-tree abort**

The tree is dirty right now (this task's uncommitted files) — exactly the state to test:

Run: `OYL_PI_SSH=nobody@invalid pnpm deploy:pi`
Expected: exit 1 with `deploy-pi: working tree is dirty — commit or stash first`. Confirms the dirty check fires BEFORE any SSH attempt (the bogus host is never contacted).

- [ ] **Step 7: Commit (script + spec + this plan)**

```bash
git add scripts/deploy-pi.sh package.json \
  docs/superpowers/specs/2026-07-20-pi-deploy-script-design.md \
  docs/superpowers/plans/2026-07-20-pi-deploy-script.md
git commit -m "feat: pnpm deploy:pi — rsync deploy of committed HEAD to the Pi

Config via OYL_PI_* keys in the untracked root .env; no host/user/IP
in tracked files.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Test the SSH-failure abort (now that the tree is clean)**

Run: `OYL_PI_SSH=nobody@192.0.2.1 pnpm deploy:pi`
Expected: after ~8s, exit 1 with `deploy-pi: cannot ssh to nobody@192.0.2.1 (check key/agent and host).` (192.0.2.1 is TEST-NET — guaranteed unroutable.)

### Task 2: Configure `.env` and dry-run against the real Pi

**Files:**
- Modify: `.env` (root — UNTRACKED; verify with `git check-ignore .env` before editing)

**Interfaces:**
- Consumes: `scripts/deploy-pi.sh --dry-run` from Task 1.
- Produces: working `OYL_PI_*` config for Tasks 3–4.

- [ ] **Step 1: Confirm `.env` is untracked**

Run: `git check-ignore -v .env`
Expected: a match on the `.gitignore` `.env` rule. If it does NOT match, STOP — do not write connection details anywhere until resolved.

- [ ] **Step 2: Append the config**

Append to root `.env` (real values come from the untracked `log/PI_SERVER_SETUP.md` and the session that verified SSH access — the login is `<ssh-user>@<pi-lan-ip>`, the public site is the production domain Caddy serves):

```
OYL_PI_SSH=<ssh-user>@<pi-lan-ip>
OYL_PI_SITE_URL=<public-site-url>
```

(`OYL_PI_APP_ROOT`/`OYL_PI_WEB_ROOT` are omitted — the defaults `/opt/oyl` and `/var/www/app` match the Pi.)

- [ ] **Step 3: Dry-run against the Pi**

Run: `pnpm deploy:pi --dry-run`
Expected: preflight passes (clean tree, SSH ok), then an itemized rsync delta. The Pi is several commits behind master, so expect: many changed files, NEW `apps/e2e-oyl/` + `DEPLOYED`, and `deleting` lines for files removed since — but NO `deleting` lines under `node_modules/`, `.git/`, or any `.env`. Ends with `DRY RUN complete; no remote steps executed.`

- [ ] **Step 4: Review the delta**

Read the delta. If anything unexpected appears (e.g. deletions of Pi-local files outside the protected excludes), STOP and fix the exclude list in `scripts/deploy-pi.sh` before Task 3. No commit in this task (`.env` is untracked).

### Task 3: First live deploy + verification

**Files:** none (operational task).

**Interfaces:**
- Consumes: Task 1 script + Task 2 config.
- Produces: the Pi running current master; evidence for Task 4's doc claims.

- [ ] **Step 1: Deploy**

Run: `pnpm deploy:pi`
Expected, in order: preflight → export → sync → remote `pnpm install` → `vanilla build:lib` → `strapi build` → `pm2 restart` → publish → `oyl-csp.sh` (prints `csp.caddy written with 2 script hash(es)`) → `strapi alive (HTTP 200|401|403)` → `caddy serving (HTTP 200)` → `DEPLOYED` contents → external site check → `==> Deployed <short-sha> to <user@host>.`

- [ ] **Step 2: Verify deployed state on the Pi**

Run: `ssh $(grep '^OYL_PI_SSH=' .env | cut -d= -f2) 'cat /opt/oyl/DEPLOYED; ls /var/www/app; pm2 ls | grep strapi'`
Expected: `sha=` matches local `git rev-parse HEAD`; web root contains exactly `index.html src styles vendor` (the stray `scripts` dir from the old publish is gone); strapi `online`.

- [ ] **Step 3: Verify the live site in a browser**

Open the public site: the app loads, `/status` → Connection shows Remote, sign-in works, no console errors. If the app is broken, roll back: `git stash` any local work, `git checkout <previous-sha>`, `pnpm deploy:pi`, `git checkout master` — then debug before re-deploying.

### Task 4: Document the command

**Files:**
- Modify: `CLAUDE.md` (Dev workflows code block)
- Modify: `log/PI_SERVER_SETUP.md` (untracked — add an interim-deploy note to §10)

**Interfaces:**
- Consumes: verified behavior from Task 3.
- Produces: docs matching reality.

- [ ] **Step 1: Add the command to CLAUDE.md**

In the Dev workflows code block, after the `pnpm e2e` line, add:

```bash
pnpm deploy:pi           # deploy committed HEAD to the production Pi (config: OYL_PI_* in untracked root .env; --dry-run to preview)
```

- [ ] **Step 2: Note the interim deploy in the (untracked) server setup doc**

At the top of §10 in `log/PI_SERVER_SETUP.md`, add:

```markdown
> **Interim (2026-07-20):** until this runner exists, deploys run from the Mac via
> `pnpm deploy:pi` (`scripts/deploy-pi.sh`): rsync of committed HEAD → /opt/oyl,
> remote build, pm2 restart, publish to /var/www/app, oyl-csp.sh, health checks.
> Connection config lives in the untracked root `.env` (`OYL_PI_*`).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document pnpm deploy:pi in dev workflows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(`log/` is gitignored — its edit rides along uncommitted by design.)
