# CLAUDE.md

Operator notes for working in this repo. Keep terse; update when something changes.

## What this is

OYL ("Organize Your Life") — a personal productivity stack covering daily activities, goals, and nutrition tracking. pnpm workspace monorepo. Strapi backend, frontend apps (Next.js + Vite/React, plus a new zero-dependency vanilla app under `apps/`), shared TS lib, Storybook, Playwright e2e.

`apps/` is the new home for all apps going forward; everything shared lives in `@oyl/all-of-oyl` `src/` (the single source of truth). `packages/` holds the existing packages and the legacy testbed.

## Packages

| Package | Role | Stack |
|---|---|---|
| `@oyl/all-of-oyl` | Shared lib consumed by `next-oyl`, `react-oyl`, and `apps/vanilla-oyl`. Legacy type-only `modules/*` (`activity`, `calendar`, `data`, `goal`, `nutrition`, `user`; vendors `open-food-facts`). **`src/` is the new zero-dependency domain core** (journal/planner/vault/goals/insights/sharing) — spec at `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md`. Wired as the package entry: `import { … } from '@oyl/all-of-oyl'` hits `src/index.ts`; `@oyl/all-of-oyl/modules` still serves the legacy barrel. `src/` uses NodeNext with explicit `.js` import extensions and has a browser ESM build (`pnpm all-of build` → `dist/`, consumed only by `apps/vanilla-oyl` via importmap; react/next still consume the TS source). `src/collections.ts` is the canonical persistable-type manifest (collection→codec); `src/core/local-storage-repository.ts` is a `Repository` adapter over Web Storage. Consumers typecheck the TS source under their own flags, so `src/` enforces `noUnusedLocals`/`noUnusedParameters` too. | TS (strict for `src/`), Vitest |
| `@oyl/strapi-oyl` | CMS / API backend. SQLite for e2e, Postgres in compose. | Strapi 5 |
| `@oyl/react-oyl` | Primary web client. Talks to Strapi via `VITE_STRAPI_API_BASE_URL`. | Vite, React 19, Tailwind 4, react-router 7, Vitest |
| `@oyl/next-oyl` | Secondary Next.js client. | Next 16, React 19, Tailwind 3 |
| `@oyl/storybook-oyl` | Shared component stories. | Storybook 10, Vite, React 19 |
| `@oyl/e2e-oyl` | End-to-end tests. Spins up Strapi + React itself. See `packages/e2e-oyl/README.md` — it is up to date. | Playwright |
| `@oyl/vanilla-oyl` | **New flagship app at `apps/vanilla-oyl`.** Zero runtime deps: vanilla JS + JSDoc, Web Components (shadow DOM + design tokens), a signals reactive core (`src/lib/reactive/`), localStorage via `LocalStorageRepository`, themes via `light-dark()`/`oklch()`. Consumes `@oyl/all-of-oyl` `dist/` through an importmap (`pnpm vanilla build:lib` builds + vendors it into `vendor/`). Status screen at `#/status` is the diagnostics/acceptance surface. Spec: `docs/superpowers/specs/2026-06-12-vanilla-oyl-foundation-design.md`. | Vanilla JS, Vitest (happy-dom), http-server |
| `@oyl/vanilla-oyl-legacy` | Old vanilla JS testbed at `packages/vanilla-oyl`. Static preview only; pending deletion once the new app reaches parity. | http-server |

## Port map (docker compose)

| Service | Host port | Container port |
|---|---|---|
| strapi | 3337 | 1337 |
| next | 3041 | 3000 |
| react | 5041 | 5173 |
| storybook | 6041 | 6006 |
| postgres | 5441 | 5432 |
| strapi-app | 3340 | 1340 |
| vanilla | 8041 | 8041 — manual or compose |

Native dev (`pnpm <pkg> dev` outside docker) uses each tool's default port (1337, 3000, 5173, 6006). The e2e harness uses native ports by default; override via `E2E_STRAPI_PORT` / `E2E_VITE_PORT`.

## Dev workflows

Root has filter shortcut scripts. From the repo root:

```bash
pnpm strapi develop      # Strapi dev (port 1337 native, 3337 in docker)
pnpm react dev           # Vite dev server
pnpm next dev            # Next.js dev server
pnpm storybook storybook # Storybook dev
pnpm e2e test            # Playwright e2e (spins up its own strapi + react)
pnpm all-of test         # Vitest on the shared lib
pnpm all-of build        # Emit browser ESM to packages/all-of-oyl/dist
pnpm vanilla dev         # build all-of-oyl → vendor into the app → http-server on 8041
pnpm vanilla test        # Vitest (happy-dom) on the new app
pnpm vanilla-legacy preview  # the old static testbed on 8041 (@oyl/vanilla-oyl-legacy)
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

## Tests and checks per package

| Package | Test | Lint | Typecheck |
|---|---|---|---|
| `all-of-oyl` | `pnpm --filter @oyl/all-of-oyl test` (vitest; covers `modules/` + `src/`) | — | `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit`; strict `src/`-only gate: `pnpm --filter @oyl/all-of-oyl typecheck:src` |
| `react-oyl` | `pnpm --filter @oyl/react-oyl test` | `pnpm --filter @oyl/react-oyl lint` | `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit` |
| `next-oyl` | — | `pnpm --filter @oyl/next-oyl lint` | `pnpm --filter @oyl/next-oyl exec tsc --noEmit` |
| `strapi-oyl` | — | — | `pnpm --filter @oyl/strapi-oyl exec tsc --noEmit` |
| `storybook-oyl` | — (uses addon-vitest) | `pnpm --filter @oyl/storybook-oyl lint` | `pnpm --filter @oyl/storybook-oyl exec tsc -b --noEmit` |
| `e2e-oyl` | `pnpm --filter @oyl/e2e-oyl test` | — | — |
| `vanilla-oyl` | `pnpm vanilla test` (vitest, happy-dom) | — | `pnpm vanilla typecheck` (`tsc --noEmit`, JSDoc checkJs). Resolves `@oyl/all-of-oyl` to TS source, so needs no prior build. |

Root aggregates run scripts across `./packages/*` **and** `./apps/*` with `--if-present`: `pnpm test`, `pnpm lint`, `pnpm typecheck`. (These do not build `all-of-oyl/dist` first — the browser-facing `pnpm vanilla dev`/`build:lib` do.)

## Conventions and gotchas

- Strapi runs on host port **3337** (compose maps 3337→1337). The default Strapi port (1337) only applies when running it natively without docker.
- `@oyl/all-of-oyl` is the workspace single source of truth: the bare specifier hits `src/index.ts` (the new domain core), `@oyl/all-of-oyl/modules` the legacy barrel. react/next/vanilla all depend on it via workspace protocol. Only `apps/vanilla-oyl` consumes the built `dist/` (browser ESM, via importmap + a vendored copy); the others typecheck/run against the TS source.
- New shared business logic goes in `@oyl/all-of-oyl/src` (never duplicated in an app). When adding a persistable type, register it in `src/collections.ts` so every app and the future backend pick it up. `src/` is `"type": "module"` + NodeNext, so all relative imports need explicit `.js` extensions; the build guard (`scripts/check-no-bare-imports.mjs`) fails if `dist/` ever gains a bare-specifier import (would break the one-entry importmap).
- `rrule` quirk: it ships as a CJS default-export. Import as `import rrule from 'rrule'; rrule.rrulestr(...)` (the named `rrulestr` is undefined on some resolvers).
- `.env` at the repo root holds `PG_CONNECTION`, `TEST_USER`, `TEST_PASSWORD`. Both `strapi` and `next` compose services load it via `env_file`.
- `TODO.md` at the root is the active roadmap. `.remember/` is session-continuity scratch (see `.remember/remember.md`).
- Most permission allowlist entries in `.claude/settings.local.json` are file-specific; running `/fewer-permission-prompts` would collapse them into patterns.
- Stale boilerplate: `packages/next-oyl/README.md` and `packages/react-oyl/README.md` are still the framework-template defaults — ignore them.
