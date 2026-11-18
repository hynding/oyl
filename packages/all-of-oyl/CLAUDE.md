# all-of-oyl — shared zero-dependency domain core

The workspace single source of truth (journal/planner/vault/goals/insights/sharing/finance/nutrition). New shared business logic goes here, never in an app.

## Entry points

- `@oyl/all-of-oyl` → `src/index.ts`.
- `/format` → `src/format/`: shared DOM-free formatters (`formatMoney`/`formatNutrients`/day+cadence helpers, `formatWeight(kg, units)`, `formatHeight(cm, units)`, `age(birthday, today)` — dates `YYYY-MM-DD`). Never duplicate these app-side.
- `/client` → `src/client/`: shared client state layer — signals core `signal`/`computed`/`effect`, domain stores, bootstrap/outbox/flusher wiring (`makeRepositories`, `createDataState`), auth/route session state, seed/backup serialization. Browser globals arrive via `src/client/ports.ts`. Never re-exported from the root barrel; never deep-imported (`@oyl/all-of-oyl/client/...`) — two reactive cores = screens silently stop updating.

Consumers: stencil-oyl bundles `dist/`; vanilla-oyl loads `dist/` via importmap + vendored copy (`pnpm vanilla build:lib`); strapi-oyl and typecheckers use TS source.

## Key modules

- `src/collections.ts` — canonical persistable-type manifest (collection→codec). Register every persistable type here. (`src/ocari/` types are deliberately NOT here — nothing persists.)
- `src/core/http-repository.ts` — `FetchFn`/`HttpRepositoryError` (injected into `api-client.ts`). `src/core/local-storage-repository.ts` — `StorageLike`; retained dormant as basis for future private mode.
- `src/client/storage/bootstrap.ts` — `BACKED` (personal) and `CATALOG_BACKED` (catalog) gate which collections get live clients. `lifeAreas` has NO Strapi content-type yet → must stay out of `CATALOG_BACKED` (a live client 404s `/api/life-areas`).
- `src/client/storage/config.ts` — `defaultStorageMode` is `'remote'` everywhere; a fresh profile boots against `DEFAULT_API_BASE_URL` (`http://localhost:1340/api`).
- `src/client/storage/seed.ts` — `seedAccount`: `makeSeed(today)` re-anchors the fixture slice to the real today; `remapIds` re-mints every record id per seeding (`recordId` is globally unique server-side — two accounts must not collide). `?seed` seeds only an EMPTY signed-in account ("empty" = personal collections only — the shared catalog doesn't count).
- `src/client/session/` — `route.ts` (`parsePath`/`createRouteState`/`navigate`), `auth-guard.ts`, `auth.ts` (adopts `#google=<jwt>` before the guard), `access.ts` (`createAccessState`, admin answer cached per user under `oyl/access`).
- `src/client/stores/` — `profile.ts` (+ `resolveTimezone`), `journal.ts` (`consumptionsOn`/`dailyNutrients`), `consumables.ts`.
- `src/nutrition/nutrients.ts` — nutrient helpers (`sumNutrients`). Catalog type is `Consumable` (was `Food`).
- `src/google/` — DOM-free Drive client with an `AccessTokenProvider` seam.

Status-screen tools (both apps) are account-scoped: Load demo data / Download backup / Import backup go THROUGH the stores (writes flush via the outbox; server upserts by id), Remote mode only; Reset local data is Local-mode only. Export/import round-trip the same wire shapes `loadDataset` accepts.

## Rules

- `src/` is `"type": "module"` + NodeNext: relative imports need explicit `.js` extensions. Strict TS with `noUnusedLocals`/`noUnusedParameters`.
- **Anything touching Web/DOM globals is injected via a minimal interface** (the browser build tsconfig has NO DOM lib). Examples: `FetchFn`, `StorageLike`, `src/client/ports.ts`.
- `scripts/check-no-bare-imports.mjs` fails the build if `dist/` gains a bare-specifier import (would break vanilla's importmap).
- `rrule` ships CJS default-export: `import rrule from 'rrule'; rrule.rrulestr(...)` (named `rrulestr` is undefined on some resolvers).
- Kind manifest + Strapi schema parity is enforced in tests.

## Tests / gates (all must be green when touching `src/`)

- `pnpm all-of test` (vitest)
- `pnpm all-of typecheck:src` (strict DOM-free gate) and `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` (full, DOM lib)
- `pnpm all-of build` (DOM-safety + bare-import gate)
- Then rebuild consumers: stencil-oyl scripts do it; a running vanilla server needs `pnpm vanilla build:lib`.
