# Backend SP4c — Compose the new app stack (strapi-app + vanilla + Postgres) — Design

**Status:** approved (extend docker-compose.yaml; add both services; verify-stack-pattern image; R-1–R-9)
**Date:** 2026-06-15
**Scope:** repo-root infra only (`docker-compose.yaml`, a new `Dockerfile.app`, `CLAUDE.md`). **No app code change**, no `apps/strapi-oyl`/`apps/vanilla-oyl` source change, no CORS change.
**Context:** SP4a wired the HTTP adapter, SP4b added the Connection settings UI, and `apps/strapi-oyl` is a conformant backend (SP2) — but the new app stack only runs via native `pnpm` processes. **SP4c brings the new stack up under Docker Compose**: an `apps/strapi-oyl` service backed by Postgres + a `vanilla-oyl` service, so `docker compose up` yields a browser-usable remote-persistence stack. SP5 = offline-first sync.

---

## What this is

Two new services in the existing `docker-compose.yaml` — `strapi-app` (the SP2 backend, on Postgres) and `vanilla` (the SP4 client) — built from a new `Dockerfile.app` modeled on the proven `Dockerfile.verify`. Postgres is reused (a new `oyl_app` database). The browser hits `vanilla` at `localhost:8041` and (after pointing the SP4b Connection URL at `localhost:3340/api`) persists to `strapi-app`/Postgres.

### Decisions (settled)

1. **Extend `docker-compose.yaml`** (not a new file) — one `docker compose up` brings the whole stack; the legacy and new services coexist on different ports.
2. **Add BOTH `strapi-app` and `vanilla`** so the new stack runs end-to-end in containers.
3. **R-1 · New `Dockerfile.app`, modeled on `Dockerfile.verify`** (NOT the root `Dockerfile`, which pins `--platform=linux/amd64` → slow QEMU on Apple Silicon and lacks `python3/make/g++` for native-dep installs). Host architecture, `apk add wget python3 make g++`, corepack pnpm, **layer-cached manifest staging**, `pnpm install --frozen-lockfile`, then `COPY . .`. One image, shared by both services via per-service `command:` (the verify strapi+react pattern). **Its staged COPY must include the `apps/*` manifests** — `Dockerfile.verify` lists only `packages/*` (a latent gap not propagated here).
4. **R-2 · Inline dev secrets in compose `environment:`** (no `env_file`). `apps/strapi-oyl/.env` is gitignored and excluded by `.dockerignore`; `.env.example` holds literal placeholders. The verify stack inlines dummy secrets — same here, plus `DATABASE_CLIENT=postgres` + `DATABASE_URL`.
5. **R-3 · `command: pnpm strapi-app develop`** — like verify's `strapi develop`: builds the admin, runs dev mode, and **auto-migrates** the schema + re-runs `src/index.ts`'s role grants into the empty `oyl_app` on first boot.
6. **R-4 · Healthcheck `wget …/_health`, `start_period: 90s`** (Strapi boots slowly, esp. first migration), mirroring verify.
7. **R-5 · `depends_on`:** `strapi-app` → `postgres` `service_healthy`; `vanilla` → `strapi-app` `service_started` (ordering only — vanilla is static and calls the backend from the browser at runtime, so it must not block ~90s on the healthcheck).
8. **R-6 · Reuse Postgres + add `oyl_app`** to the init SQL. **Caveat (documented):** init scripts run only on a fresh volume, so an existing `database-data-oyl` needs a one-time `docker compose down -v` (or manual `createdb oyl_app`).
9. **R-7 · No CORS change.** The page origin is `http://localhost:8041` (already allowed in `apps/strapi-oyl/config/middlewares.ts`); the host-mapped API port (3340) never appears in the `Origin` header.
10. **R-8/R-9 · `vanilla`: `pnpm vanilla dev`** (= `build:lib && http-server -c-1 -p 8041 .`, binds 0.0.0.0), ports `8041:8041`. **`strapi-app`: ports `3340:1340`** (33xx convention; container `PORT=1340`). The user sets the Connection URL to `http://localhost:3340/api` via SP4b.

### Out of scope (→ SP5 / later)

Offline-first sync (SP5). Production hardening (real secrets, TLS, non-dev `NODE_ENV`, resource limits). Eventual removal of the legacy `strapi`/`next`/`react`/`storybook` services. Baking a compose-specific default backend URL into vanilla (the app reads it from localStorage per SP4b; the Connection UI is the intended mechanism).

---

## Architecture

### 1. `Dockerfile.app` (new, repo root)

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

(`.dockerignore` already excludes `node_modules`, `.git`, `.tmp`, `dist`, `.env` — the build context stays lean and host `node_modules` are never shipped.)

### 2. `docker-compose.yaml` — two new services + the Postgres init edit

Add under `services:` (placed after the legacy `strapi` for readability):

```yaml
  strapi-app:
    image: oyl-app:dev          # shared tag → Dockerfile.app builds once (R-10)
    build:
      context: .
      dockerfile: Dockerfile.app
    command: pnpm strapi-app develop
    environment:
      NODE_ENV: development
      HOST: 0.0.0.0
      PORT: 1340
      # R-12: discrete vars (NOT DATABASE_URL) — database.ts sets both connectionString
      # AND host (default 'localhost'); an explicit host can override the URL's host in
      # node-postgres, so the URL form risks dialing localhost. Discrete is unambiguous.
      DATABASE_CLIENT: postgres
      DATABASE_HOST: postgres
      DATABASE_PORT: "5432"
      DATABASE_NAME: oyl_app
      DATABASE_USERNAME: postgres
      DATABASE_PASSWORD: postgres
      # Dummy dev secrets — fresh per `up`, no .env import (mirrors the verify stack).
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
    image: oyl-app:dev          # same tag → reuses the strapi-app build (R-10)
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

`environment` overrides the image/`.env`'s `DATABASE_CLIENT=sqlite` (compose env beats dotenv, which won't override an existing process var). `ENCRYPTION_KEY` is a 32-char value (AES-256). `STRAPI_MCP_ENABLED=false` disables the MCP plugin (default `true` in `config/server.ts`). `pnpm@10.13.1` (the Dockerfile.app corepack pin) matches the root `packageManager`; `esbuild`/`better-sqlite3`/`sharp` are in the root `pnpm.onlyBuiltDependencies`, so their native builds run during `pnpm install` (hence the `apk` toolchain).

Edit the existing `postgres` service's init command to create the second database:

```yaml
    command: >
      sh -c "
        echo '
          CREATE DATABASE oyl;
          CREATE DATABASE oyl_app;
        ' > /docker-entrypoint-initdb.d/00-init.sql && docker-entrypoint.sh postgres
      "
```

### 3. CORS — no change (R-7)

`apps/strapi-oyl/config/middlewares.ts` already allows `http://localhost:8041`. The browser page served by `vanilla` (origin `localhost:8041`) sends that as its `Origin` on every call to `localhost:3340/api`; the destination port is not part of the `Origin` header. No middleware change.

### 4. Docs — `CLAUDE.md`

- **Port map:** add a row `strapi-app | 3340 | 1340`; note `vanilla` `8041` is now also composed (was "manual").
- **Dev workflows / compose section:** a short blurb —
  ```bash
  docker compose up -d --build postgres strapi-app vanilla
  ```
  **Bring up the services explicitly** (R-11) — a bare `docker compose up` also starts the legacy `strapi`/`next`/`react`/`storybook` services. Then in the browser at `http://localhost:8041` go to **Status → Connection**, set the backend URL to `http://localhost:3340/api`, mode **Remote**, **Apply & reload**, and sign in (Account). Notes: the `oyl_app` database + the **`docker compose down -v` caveat** (needed once if the `database-data-oyl` volume predates SP4c); and **don't run native `pnpm vanilla dev` and the composed `vanilla` at the same time** — both bind host `8041` (R-13).

---

## Testing / Acceptance

There are no unit tests for infra. Acceptance is a real `docker compose` bring-up:

1. `docker compose up -d --build postgres strapi-app vanilla` → after up to ~90s, `docker compose ps` shows `strapi-app` **healthy** and `vanilla` up. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3340/_health` → `204`.
2. Browser `http://localhost:8041` → **Status → Connection**: set URL `http://localhost:3340/api`, **Remote**, **Apply & reload**; **Account** → register a user (signed-in).
3. Add a journal entry → it persists (network PUT to `:3340` → 2xx). `docker compose restart strapi-app` (Postgres volume persists) → reload the browser → the entry is still there (served from `oyl_app`).
4. `docker compose down -v` then repeat from step 1 → a clean slate (fresh `oyl_app`), proving the init + first-boot migration path.

(This exercises the same remote round-trip proven natively in SP4a, now fully containerized on Postgres.)

## File structure

```
Dockerfile.app          (new — app-stack image, verify-pattern)
docker-compose.yaml     (modify — add strapi-app + vanilla services; add CREATE DATABASE oyl_app)
CLAUDE.md               (modify — port map row + compose usage + down -v caveat)
```

No application source, no `apps/strapi-oyl` config, no CORS change. The legacy `strapi`/`next`/`react`/`storybook`/`postgres` services are untouched except the one extra `CREATE DATABASE` line.

## Acceptance summary

`docker compose up -d --build postgres strapi-app vanilla` yields a healthy Postgres-backed `apps/strapi-oyl` on `localhost:3340` and `apps/vanilla-oyl` on `localhost:8041`; pointing the SP4b Connection URL at `:3340` and signing in persists data to Postgres `oyl_app` across container restarts. Ready for SP5 (offline-first sync).
