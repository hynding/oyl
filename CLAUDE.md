# CLAUDE.md

Operator notes for working in this repo. Keep terse; update when something changes.

## What this is

OYL ("Organize Your Life") — a personal productivity stack covering daily activities, goals, and nutrition tracking. pnpm workspace monorepo. Three members: a shared zero-dependency TS domain core (`@oyl/all-of-oyl`), a flagship vanilla-JS app (`apps/vanilla-oyl`), and a backend-agnostic Strapi reference backend (`apps/strapi-oyl`).

`apps/` is the home for all apps; everything shared lives in `@oyl/all-of-oyl` `src/` (the single source of truth). The legacy stack (`next-oyl`, `react-oyl`, `storybook-oyl`, `strapi-oyl`, `e2e-oyl`, the old `vanilla-oyl` testbed, `vendors/firebase`, and the `all-of-oyl` `modules/`+`vendors/` barrels) was removed on 2026-06-16 — **preserved on branch `legacy/2026-06-16`** if you need to reference or restore any of it.

## Packages

| Package | Role | Stack |
|---|---|---|
| `@oyl/all-of-oyl` | **Shared zero-dependency domain core** (`src/`: journal/planner/vault/goals/insights/sharing + the offline-first sync engine) — spec at `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md`. The single source of truth. Bare specifier `@oyl/all-of-oyl` → `src/index.ts`; `@oyl/all-of-oyl/testing` → `src/core/http-repository-contract.ts` (the conformance suite). `src/` uses NodeNext with explicit `.js` import extensions and has a browser ESM build (`pnpm all-of build` → `dist/`, consumed only by `apps/vanilla-oyl`). `src/collections.ts` is the canonical persistable-type manifest (collection→codec); `src/core/local-storage-repository.ts` + `src/core/http-repository.ts` are `Repository` adapters; `src/core/sync-engine.ts` is the offline-first engine. `src/` enforces `noUnusedLocals`/`noUnusedParameters`. | TS (strict for `src/`), Vitest |
| `@oyl/vanilla-oyl` | **Flagship app at `apps/vanilla-oyl`.** Zero runtime deps: vanilla JS + JSDoc, Web Components (shadow DOM + design tokens), a signals reactive core (`src/lib/reactive/`), localStorage via `LocalStorageRepository`, themes via `light-dark()`/`oklch()`. Local-first; Remote mode is offline-first (cache+outbox+delta-pull) talking to `apps/strapi-oyl`. Consumes `@oyl/all-of-oyl` `dist/` through an importmap (`pnpm vanilla build:lib` builds + vendors it into `vendor/`). Status screen at `#/status` is the diagnostics/acceptance surface (Connection, Account, Sync). Spec: `docs/superpowers/specs/2026-06-12-vanilla-oyl-foundation-design.md`. | Vanilla JS, Vitest (happy-dom), http-server |
| `@oyl/strapi-oyl-app` | **Backend at `apps/strapi-oyl`.** Backend-agnostic reference backend for the OYL sync protocol (`docs/oyl-sync-protocol-v1.md`): a generic `oyl-record` store, `/v1` routes (auth-gated, owner-scoped), `?since=<ISO>` delta. SQLite for dev/test (`.tmp/data.db`), Postgres (`oyl_app`) in compose. **Must stay backend-agnostic — the protocol/contract never assumes Strapi.** | Strapi 5 |

## Port map (docker compose)

| Service | Host port | Container port |
|---|---|---|
| strapi-app | 3340 | 1340 |
| vanilla | 8041 | 8041 |
| postgres | 5441 | 5432 |

Native dev (`pnpm <pkg> develop`/`dev` outside docker) uses each tool's default port (strapi-app: 1340; vanilla: 8041).

## Dev workflows

Root filter shortcuts. From the repo root:

```bash
pnpm all-of test         # Vitest on the shared lib (src/)
pnpm all-of build        # Emit browser ESM to packages/all-of-oyl/dist
pnpm strapi-app develop  # Strapi backend dev (port 1340 native, 3340 in docker)
pnpm vanilla dev         # build all-of-oyl → vendor into the app → http-server on 8041
pnpm vanilla test        # Vitest (happy-dom) on the app
```

Docker — the full app stack (postgres + backend + app):

```bash
docker compose up -d --build postgres strapi-app vanilla
```

Then at `http://localhost:8041` go to **Status → Connection**, set the backend URL to `http://localhost:3340/api`, mode **Remote**, **Apply & reload**, and sign in (Account). `strapi-app` uses Postgres database `oyl_app`; if your `database-data-oyl` volume predates this, run `docker compose down -v` once so the `CREATE DATABASE oyl_app` init runs. Don't run native `pnpm vanilla dev` and the composed `vanilla` together — both bind host `8041`. Both compose services share one image (`oyl-app:dev`, built from `Dockerfile.app`).

## Tests and checks per package

| Package | Test | Typecheck |
|---|---|---|
| `all-of-oyl` | `pnpm --filter @oyl/all-of-oyl test` (vitest, `src/`) | `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` (full, DOM lib); strict DOM-free `src/` gate: `pnpm --filter @oyl/all-of-oyl typecheck:src`; DOM-safety build gate: `pnpm all-of build` (fails if `dist/` gains a bare import) |
| `vanilla-oyl` | `pnpm vanilla test` (vitest, happy-dom) | `pnpm vanilla typecheck` (`tsc --noEmit`, JSDoc checkJs). Resolves `@oyl/all-of-oyl` to TS source, so needs no prior build. |
| `strapi-oyl-app` | `pnpm --filter @oyl/strapi-oyl-app test` (booted in-process Strapi: full `httpProtocolContract` + smoke; needs a prior `strapi build` — the boot harness runs from `dist/`) | `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit` |

Root aggregates run scripts across `./packages/*` **and** `./apps/*` with `--if-present`: `pnpm test`, `pnpm lint`, `pnpm typecheck`. (These do not build `all-of-oyl/dist` first — `pnpm vanilla dev`/`build:lib` do.)

## Conventions and gotchas

- `@oyl/all-of-oyl` is the workspace single source of truth: the bare specifier hits `src/index.ts`, `/testing` the conformance contract. Both apps depend on it via workspace protocol. Only `apps/vanilla-oyl` consumes the built `dist/` (browser ESM, via importmap + a vendored copy); `apps/strapi-oyl` and the typecheckers run against the TS source.
- New shared business logic goes in `@oyl/all-of-oyl/src` (never duplicated in an app). When adding a persistable type, register it in `src/collections.ts` so every app and the backend pick it up. `src/` is `"type": "module"` + NodeNext, so all relative imports need explicit `.js` extensions. **Anything in `src/` that touches Web/DOM globals must be injected via a minimal interface** (the browser build tsconfig has NO DOM lib — `pnpm all-of build` is the gate); see `src/core/http-repository.ts` (`FetchFn`/`StorageLike` pattern). The build guard (`scripts/check-no-bare-imports.mjs`) fails if `dist/` ever gains a bare-specifier import (would break the one-entry importmap).
- **Backend-agnostic constraint:** the sync protocol + `@oyl/all-of-oyl` never assume Strapi. `apps/strapi-oyl` is one conformant reference backend (proven by `httpProtocolContract`); any backend (a custom Node/Express+ORM service, a PHP+JSON server, …) is valid iff it passes that contract. `docs/oyl-sync-protocol-v1.md` is the spec.
- `rrule` quirk: it ships as a CJS default-export. Import as `import rrule from 'rrule'; rrule.rrulestr(...)` (the named `rrulestr` is undefined on some resolvers).
- `apps/strapi-oyl` routes mount under Strapi's `/api` prefix → the client protocol baseUrl is `http://host/api` (the adapter appends `/v1`). `/v1` routes are JWT-gated + owner-scoped (structural tenant isolation); the bootstrap (`src/index.ts`) grants the `authenticated` role only the 5 `oyl-record` actions. CORS (`config/middlewares.ts`) allows `http://localhost:8041`.
- `TODO.md` at the root is the active roadmap. `.remember/` is session-continuity scratch (see `.remember/remember.md`).
- Most permission allowlist entries in `.claude/settings.local.json` are file-specific; running `/fewer-permission-prompts` would collapse them into patterns.
