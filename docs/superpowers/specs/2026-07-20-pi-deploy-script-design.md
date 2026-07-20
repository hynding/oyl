# Pi Deploy Script — Design

**Date:** 2026-07-20
**Status:** Approved (pending spec review)

## Purpose

One command — `pnpm deploy:pi` — that updates the production Pi to the currently
committed state of this repo: syncs the workspace, rebuilds both apps, restarts
Strapi, publishes the static frontend, regenerates CSP script hashes, and
verifies health. Interim solution until (if ever) the GitHub-Actions self-hosted
runner from the server setup plan (§10) is stood up; this script does not
preclude that.

## Constraints

- **Committed HEAD only.** The script deploys exactly `git archive HEAD` and
  aborts if the working tree is dirty. Production always runs a known commit.
- **No secrets or environment-identifying data in tracked files.** The script
  (tracked) contains no IP, hostname, username, or credential. Connection
  details come from the untracked root `.env` (or the environment). The server
  setup doc lives in the gitignored `log/` and stays there.
- **No new infra on the Pi.** Everything the script needs already exists there:
  SSH key auth, passwordless sudo for the deploy user, pm2 app `strapi`, Caddy
  serving the web root, and `/usr/local/bin/oyl-csp.sh` (hash regen + Caddy
  reload).
- **The workspace deploys whole.** `apps/strapi-oyl` resolves
  `@oyl/all-of-oyl` via `workspace:*`, which only works from the repo root with
  the root lockfile — never sync an app subdir in isolation.

## Configuration

Read from the environment first, then from specific keys grepped out of the
root `.env` (never `source`d wholesale — it holds unrelated credentials):

| Key | Required | Default | Meaning |
|---|---|---|---|
| `OYL_PI_SSH` | yes | — | `user@host` for SSH to the Pi |
| `OYL_PI_APP_ROOT` | no | `/opt/oyl` | workspace root on the Pi |
| `OYL_PI_WEB_ROOT` | no | `/var/www/app` | Caddy static web root |
| `OYL_PI_SITE_URL` | no | (skip external check) | public site URL for the final health check |

Missing `OYL_PI_SSH` aborts with a message showing the exact `.env` lines to add.

## Interface

- `scripts/deploy-pi.sh` — bash, `set -euo pipefail`.
- Root `package.json`: `"deploy:pi": "scripts/deploy-pi.sh"`.
- Flag: `--dry-run` — run preflight and show the rsync delta (`rsync -n`),
  mutate nothing locally or remotely.

## Flow

### 1. Preflight (local)

1. Resolve config (env → `.env` keys); abort if `OYL_PI_SSH` unset.
2. Abort if `git status --porcelain` is non-empty (with a hint about
   committing or stashing).
3. Capture `git rev-parse HEAD` (full + short SHA).
4. SSH reachability check (`ConnectTimeout=8`, `BatchMode=yes`); abort with a
   pointer to key/agent setup on failure.

### 2. Sync (Mac → Pi)

1. `git archive HEAD` extracted to a local temp dir (auto-cleaned via trap).
2. `rsync -a --delete` temp dir → `$OYL_PI_APP_ROOT`, excluding `.git/`,
   `node_modules/`, `.tmp/`, `.env*`. Excluded paths are protected from
   `--delete`, so the Pi's installed deps and any Pi-local env survive; files
   deleted in git genuinely disappear on the Pi.
3. Write `$OYL_PI_APP_ROOT/DEPLOYED` (SHA + UTC timestamp). The Pi's vestigial
   `.git` clone is left alone but `DEPLOYED` is the source of truth for what's
   running — `git log` on the Pi no longer describes the deployed tree.

### 3. Build + restart (on the Pi, one SSH session, fail-fast)

```
cd $OYL_PI_APP_ROOT
pnpm install --frozen-lockfile
pnpm vanilla build:lib                  # builds all-of-oyl dist + vendors into the app
set -a; source /etc/strapi/strapi.env; set +a
pnpm strapi-app build                   # load-bearing: regenerates content-type UID types
pm2 restart strapi --update-env
```

### 4. Publish frontend

`rsync -a --delete` of exactly `index.html`, `src/`, `styles/`, `vendor/` from
`$OYL_PI_APP_ROOT/apps/vanilla-oyl/` → `$OYL_PI_WEB_ROOT` (the app's four
root-absolute asset roots; anything else in the web root is removed), then
`sudo /usr/local/bin/oyl-csp.sh` to regenerate inline-script hashes and reload
Caddy.

### 5. Health checks

1. Poll Strapi loopback (`http://127.0.0.1:$PORT/api/bootstrap`, `PORT` from
   the already-sourced `strapi.env`) for up to 60s;
   HTTP 200/401/403 counts as alive (the route is JWT-gated). Strapi runs its
   schema sync against the external DB during this boot, so the poll window
   absorbs migration time.
2. Caddy loopback check with the site `Host` header.
3. If `OYL_PI_SITE_URL` is set: `curl -sf` it from the Mac (through the
   tunnel).
4. On failure: print the tail of `pm2 logs strapi --nostream`, exit 1.

## Error handling

Fail-fast everywhere; every abort names the failed step. No auto-rollback:
rolling back = checking out an earlier commit locally and running
`pnpm deploy:pi` again (the sync stage is idempotent and `--delete` makes it
converge).

## Testing

- `bash -n` and shellcheck (if installed) on the script.
- First real run: `--dry-run` to review the delta (the Pi is several commits
  behind, so expect a large diff including deletions), then a live deploy
  verified by the health checks and loading the site.
- No e2e spec: this is operator tooling with no UI/API surface in the app.

## Out of scope

- GitHub-Actions runner automation (setup plan §10) — can layer on later.
- Auto-rollback, blue/green, deploy locking.
- Database backup before deploy (covered by the Pi's scheduled backups).
