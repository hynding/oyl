# Backend SP4c — Compose the new app stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the new app stack (`apps/strapi-oyl` on Postgres + `apps/vanilla-oyl`) up under Docker Compose so the browser persists to a containerized backend.

**Architecture:** A new `Dockerfile.app` (modeled on `Dockerfile.verify`: host-arch, build tools, layer-cached manifest staging) builds one image shared by two new `docker-compose.yaml` services — `strapi-app` (Strapi on a new Postgres `oyl_app` database) and `vanilla` (http-server). No application code or CORS change.

**Tech Stack:** Docker Compose, the existing Dockerfile.verify pattern, Strapi 5 (Postgres), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-compose-stack-design.md`

**Note on testing:** this is infra — there are no unit tests. Verification is `docker build`, `docker compose config`, and a real bring-up (Task 4). The image build runs a full `pnpm install --frozen-lockfile` and is slow (several minutes) the first time.

---

### Task 1: `Dockerfile.app`

**Files:**
- Create: `Dockerfile.app` (repo root)

- [ ] **Step 1: Create `Dockerfile.app`** with EXACTLY this content:

```dockerfile
# App-stack image — the new apps/ stack (apps/strapi-oyl backend + apps/vanilla-oyl).
# Modeled on Dockerfile.verify: host architecture (native on Apple Silicon), build
# tools for native deps, layer-cached manifest staging. Shared by the strapi-app and
# vanilla compose services, which each override `command`.

FROM node:22-alpine

WORKDIR /workspace

# wget powers the strapi healthcheck; python3/make/g++ build native deps at install.
RUN apk add --no-cache wget python3 make g++

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

# Stage every workspace member's manifest first so a code-only edit doesn't bust the
# install layer. `--frozen-lockfile` needs ALL members present (packages/* AND apps/*).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/all-of-oyl/package.json ./packages/all-of-oyl/
COPY packages/e2e-oyl/package.json ./packages/e2e-oyl/
COPY packages/next-oyl/package.json ./packages/next-oyl/
COPY packages/react-oyl/package.json ./packages/react-oyl/
COPY packages/storybook-oyl/package.json ./packages/storybook-oyl/
COPY packages/strapi-oyl/package.json ./packages/strapi-oyl/
COPY packages/vanilla-oyl/package.json ./packages/vanilla-oyl/
COPY apps/strapi-oyl/package.json ./apps/strapi-oyl/
COPY apps/vanilla-oyl/package.json ./apps/vanilla-oyl/

RUN pnpm install --frozen-lockfile

# Source after install so source edits don't invalidate the dep layer.
COPY . .

# Default command (strapi-app); the vanilla service overrides it in compose.
CMD ["pnpm", "strapi-app", "develop"]
```

- [ ] **Step 2: Build the image to verify it compiles + installs cleanly**

Run (from the repo root):
```bash
docker build -f Dockerfile.app -t oyl-app:dev .
```
Expected: the build completes successfully — manifests copied, `pnpm install --frozen-lockfile` succeeds (native deps `esbuild`/`better-sqlite3`/`sharp` build via the `apk` toolchain), `COPY . .` runs, image tagged `oyl-app:dev`. (First build is slow.)

If `pnpm install --frozen-lockfile` fails for a missing workspace manifest, double-check every member from `pnpm-workspace.yaml` (`packages/*`, `apps/*`) has its `package.json` in the staged COPY list. **STOP and report** if a member is missing rather than guessing.

- [ ] **Step 3: Commit**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add Dockerfile.app
git commit -m "build(compose): Dockerfile.app — app-stack image (verify pattern, apps/* manifests staged)"
```

---

### Task 2: Add the two services + Postgres `oyl_app` to `docker-compose.yaml`

**Files:**
- Modify: `docker-compose.yaml`

- [ ] **Step 1: Add the two services.** Insert the following two service blocks into `docker-compose.yaml` under `services:`, immediately AFTER the existing `strapi:` service block and BEFORE the `next:` service block (match the 2-space indentation of the other services):

```yaml
  strapi-app:
    image: oyl-app:dev
    build:
      context: .
      dockerfile: Dockerfile.app
    command: pnpm strapi-app develop
    environment:
      NODE_ENV: development
      HOST: 0.0.0.0
      PORT: 1340
      DATABASE_CLIENT: postgres
      DATABASE_HOST: postgres
      DATABASE_PORT: "5432"
      DATABASE_NAME: oyl_app
      DATABASE_USERNAME: postgres
      DATABASE_PASSWORD: postgres
      APP_KEYS: "app-key-a,app-key-b"
      API_TOKEN_SALT: "app-api-token-salt"
      JWT_SECRET: "app-jwt-secret"
      ADMIN_JWT_SECRET: "app-admin-jwt-secret"
      TRANSFER_TOKEN_SALT: "app-transfer-token-salt"
      ENCRYPTION_KEY: "appencryptionkey0123456789abcdef"
      STRAPI_MCP_ENABLED: "false"
    ports:
      - "3340:1340"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:1340/_health"]
      interval: 5s
      timeout: 3s
      retries: 60
      start_period: 90s

  vanilla:
    image: oyl-app:dev
    build:
      context: .
      dockerfile: Dockerfile.app
    command: pnpm vanilla dev
    ports:
      - "8041:8041"
    depends_on:
      strapi-app:
        condition: service_started
```

- [ ] **Step 2: Add `oyl_app` to the Postgres init.** In the `postgres:` service's `command:` block, change:

```yaml
          CREATE DATABASE oyl;
```

to:

```yaml
          CREATE DATABASE oyl;
          CREATE DATABASE oyl_app;
```

(Keep the surrounding `sh -c "... echo '...' > /docker-entrypoint-initdb.d/00-init.sql && docker-entrypoint.sh postgres"` exactly as-is — only the inner SQL gains one line.)

- [ ] **Step 3: Validate the compose file**

Run (from the repo root):
```bash
docker compose config >/dev/null && echo "compose OK"
```
Expected: prints `compose OK` (no YAML/schema errors). If it errors, fix the indentation/structure of the inserted blocks.

- [ ] **Step 4: Commit**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add docker-compose.yaml
git commit -m "feat(compose): strapi-app (Postgres oyl_app) + vanilla services for the new app stack"
```

---

### Task 3: Document in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the port map.** Replace this row:

```
| vanilla (manual) | 8041 | — |
```

with these two rows (the `vanilla` container listens on `8041` too — the `dev` script runs `http-server -p 8041`):

```
| strapi-app | 3340 | 1340 |
| vanilla | 8041 | 8041 — manual or compose |
```

- [ ] **Step 2: Update the compose section.** Replace this block:

```
Docker alternative — bring up the whole stack:

```bash
docker compose up postgres strapi react -d
```

The compose `react` service injects `VITE_STRAPI_API_BASE_URL=http://localhost:3337/api` so the browser hits the host-mapped Strapi port.
```

with:

```
Docker alternative — bring up the legacy stack:

```bash
docker compose up postgres strapi react -d
```

The compose `react` service injects `VITE_STRAPI_API_BASE_URL=http://localhost:3337/api` so the browser hits the host-mapped Strapi port.

New app stack (apps/strapi-oyl + apps/vanilla-oyl) — bring up explicitly (a bare `docker compose up` would also start the legacy services):

```bash
docker compose up -d --build postgres strapi-app vanilla
```

Then at `http://localhost:8041` go to **Status → Connection**, set the backend URL to `http://localhost:3340/api`, mode **Remote**, **Apply & reload**, and sign in (Account). `strapi-app` uses a separate Postgres database `oyl_app`; if your `database-data-oyl` volume predates this, run `docker compose down -v` once so the `CREATE DATABASE oyl_app` init runs. Don't run native `pnpm vanilla dev` and the composed `vanilla` together — both bind host `8041`.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add CLAUDE.md
git commit -m "docs(CLAUDE): port map + compose usage for the new app stack (strapi-app/vanilla)"
```

---

### Task 4: Acceptance — real bring-up + remote-persistence round-trip

**Files:** none (verification only).

This proves the stack works end-to-end. If a Docker daemon isn't available in this environment, **STOP and report** that Task 4 must be run manually by the user; Tasks 1–3 are still complete.

- [ ] **Step 1: Fresh bring-up**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
# clean slate so the oyl_app init runs (drops the dev DB volume):
docker compose down -v
docker compose up -d --build postgres strapi-app vanilla
```

- [ ] **Step 2: Wait for health + verify the backend**

```bash
# strapi-app can take up to ~90s to become healthy (admin build + first migration)
for i in $(seq 1 40); do
  s=$(docker inspect --format '{{.State.Health.Status}}' $(docker compose ps -q strapi-app) 2>/dev/null)
  echo "strapi-app health: $s"; [ "$s" = "healthy" ] && break; sleep 5
done
docker compose ps
curl -s -o /dev/null -w "health:%{http_code}\n" http://localhost:3340/_health
curl -s -o /dev/null -w "vanilla:%{http_code}\n" http://localhost:8041/index.html
```
Expected: `strapi-app health: healthy`; `health:204`; `vanilla:200`.

- [ ] **Step 3: Verify the protocol endpoint requires auth (sanity)**

```bash
curl -s -o /dev/null -w "noauth:%{http_code}\n" http://localhost:3340/api/v1/entries
```
Expected: `noauth:401` or `403` (auth required — confirms the SP2.2 routes + grants migrated into `oyl_app`).

- [ ] **Step 4: Browser round-trip (manual)**

At `http://localhost:8041` → **Status → Connection**: set URL `http://localhost:3340/api`, **Remote**, **Apply & reload** → **Account** → register a user → add a journal entry. Then:

```bash
docker compose restart strapi-app
```
Reload the browser (give strapi-app a few seconds) → the entry is still present (served from Postgres `oyl_app`, surviving the restart). This is the SP4c payoff: containerized remote persistence.

- [ ] **Step 5: Tear down**

```bash
docker compose down
```
(Use `down -v` to also drop the database volume.)

- [ ] **Step 6: (No commit — verification only.)** Report the health/curl results and the round-trip outcome.

---

## Notes for the implementer

- Do not change any application source, `apps/strapi-oyl/config/*`, or CORS — SP4c is infra-only.
- The legacy `strapi`/`next`/`react`/`storybook` services and the `postgres` service stay as-is except the one extra `CREATE DATABASE oyl_app;` line.
- `strapi-app` and `vanilla` share `image: oyl-app:dev` so the image builds once.
- If Docker is unavailable for Task 4, Tasks 1–3 (the deliverable files) are still complete and committable; flag Task 4 for the user.
