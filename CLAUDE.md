# CLAUDE.md

Operator notes. Keep terse; update when something changes. **Each package has its own `CLAUDE.md`** (loaded when you work in it) holding its structure, tests and gotchas — put package-specific notes there, not here. This file holds only what crosses packages.

## What this is

OYL ("Organize Your Life") — personal productivity stack (journal, planner, nutrition, finance, vault, goals, insights). pnpm workspace monorepo.

| Package | Path | Role |
|---|---|---|
| `@oyl/all-of-oyl` | `packages/all-of-oyl` | Shared zero-dep TS domain core + `/format` + `/client` (shared client state). **Single source of truth.** |
| `@oyl/ui-oyl` | `packages/ui-oyl` | Domain-agnostic Stencil component library (`ui-*` tags), tokens, themes |
| `@oyl/stencil-oyl` | `apps/stencil-oyl` | **The deployed front end** (shell + every screen; `oyl-*` tags) |
| `@oyl/vanilla-oyl` | `apps/vanilla-oyl` | **Legacy, frozen** since the 2026-10-09 cutover — kept for reference; not deployed, not in `pnpm dev`/docker/e2e, but its test + typecheck still run in CI |
| `@oyl/strapi-oyl-app` | `apps/strapi-oyl` | Strapi 5 backend — owns the DB schema and roles |
| `@oyl/camis-php-oyl` | `apps/camis-php-oyl` | camis-generated Laravel backend: same API, same DB — **the production API** |
| `@oyl/e2e-oyl` | `apps/e2e-oyl` | Playwright e2e against the real backend |
| `@oyl/ocari-oyl` | `packages/ocari-oyl` | Receipt OCR + local-LLM CLI (no UI/API surface) |

Production: DreamHost — www = stencil-oyl, api = camis-php-oyl. `.github/workflows/deploy.yml` deploys every push to `master` (gate: `pnpm test` + `pnpm typecheck`). Legacy stack removed 2026-06-16, preserved on branch `legacy/2026-06-16`. Roadmap: `TODO.md`. Specs/plans (the archive of *why*): `docs/superpowers/{specs,plans}/`.

## Architecture (cross-cutting)

- **Online-first, account-required.** Reads hit the API + bounded `ReadCache`; writes enqueue to a durable `WriteOutbox` (localStorage) and flush when online. No anonymous/local-data mode (private mode deferred). `defaultStorageMode` is `'remote'` on every host incl. localhost; the guard redirects to `/login` before any network call. `'local'` is only an explicit Status → Connection choice.
- **Entity kinds:** `personal` (owner-scoped, e.g. notes), `catalog` (creator + public-or-mine, e.g. activities), `system`.
- **Boot is ONE request:** `GET /api/bootstrap` returns every backed collection keyed by REST plural path; `decodeBootstrap` hydrates all stores (fan-out fallback on 404). `BACKED`/`CATALOG_BACKED` in `all-of-oyl/src/client/storage/bootstrap.ts` gate live clients.
- **Client state lives in `@oyl/all-of-oyl/client`, never in an app.** Exactly ONE reactive core may load — never deep-import `@oyl/all-of-oyl/client/...` or keep a local signal implementation (two cores = screens silently stop updating).
- **Routing is History API** (clean paths, `/journal/2026-06-16`): `client/session/route.ts`. Route name = first path segment. `navigate(path, { replace: true })` for forced-login redirects. Auth routes `/login`, `/register`; `/profile`.
- **Status is admin-only on stencil-oyl.** Admins = backend `OYL_ADMIN_EMAILS` (exact addresses or `@domain`; unset = nobody) via `GET /api/access` → `{ admin }`. Implemented in both backends — keep the two matchers in step. UI gating only. e2e: `test.use({ admin: true })`.
- **Timezone seam:** `client/stores/profile.ts` + `resolveTimezone(profile, browserTz)` at boot → `createDataState` and every screen's `view.tz`; tz/units changes save + reload.
- **Entry kinds split across screens:** Journal shows notes/measurements only; `transaction` → Finance, `consumption` → Nutrition.
- **Google sign-in + Drive is server-brokered** (backend owns OAuth + tokens; scope `drive.file`; callback → single `APP_URL`, session handed back as `#google=<jwt>`). `APP_URL` is stencil-oyl's origin. Unset `GOOGLE_CLIENT_ID`/`SECRET` hides it entirely.

## Commands (repo root)

```bash
pnpm dev | dev:fresh               # backend :1340 + stencil-oyl dev server :3344 (fresh: wipe SQLite first)
pnpm all-of|ui|stencil|vanilla|strapi-app|php-app <script>   # filter shortcuts
pnpm e2e                           # Playwright, all servers auto-start; use --workers=4 on this machine
E2E_BACKEND=php pnpm e2e           # same suite against the PHP backend
pnpm test | lint | typecheck       # every package (--if-present); does NOT build all-of-oyl dist first
pnpm deploy:dreamhost              # manual deploy of HEAD (OYL_DH_* in untracked .env; --dry-run, --only www|api)
docker compose up -d --build postgres strapi-app stencil   # composed stack: app :3344, backend :3340
```

Docker: the backend is on 3340, so at `http://localhost:3344` set Status → Connection to `http://localhost:3340/api` (needs an admin account) and Apply & reload. Postgres DB `oyl_app` (an old `database-data-oyl` volume needs `docker compose down -v` once).

Ports — native: strapi 1340, stencil 3344, ui showcase 3443, legacy vanilla 8041. e2e: app 8043, backend 1341, fake Google 1342. Docker: strapi 3340, stencil 3344, postgres 5441.

## Definition of Done — run for what you changed

| Changed | Run (all green before commit) |
|---|---|
| `packages/all-of-oyl/src` | `pnpm all-of test` · `pnpm all-of typecheck:src` · `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` · `pnpm all-of build` — plus the tests of affected apps |
| `packages/ui-oyl` | `pnpm ui test` · `pnpm ui typecheck` |
| `apps/stencil-oyl` | `pnpm stencil test` · `pnpm stencil typecheck` |
| `apps/vanilla-oyl` (frozen — only to keep it green after a shared-lib change) | `pnpm vanilla test` · `pnpm vanilla typecheck` |
| `apps/strapi-oyl` | `pnpm strapi-app build` first, then `pnpm --filter @oyl/strapi-oyl-app test` · `… exec tsc --noEmit` |
| `apps/camis-php-oyl` | `pnpm php-app test` · `pnpm php-app typecheck` |
| any UI- or API-facing change | `pnpm e2e --workers=4` (new screen/feature/route ⇒ new or extended spec; see `apps/e2e-oyl/README.md`) |

## Development practices

- **TDD:** failing test first, minimal code, then commit. Tests assert observable behavior, not internals (assert via a component's own shadowRoot/props). Never weaken a type/lint rule or add throwaway markup to pass a test.
- **Architecture:** shared logic only in `@oyl/all-of-oyl/src`; register persistable types in `src/collections.ts`; DOM/Web globals injected via interfaces, never referenced in `src/`. Small, single-responsibility files.
- **Non-trivial work:** brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → TDD → review.
- **Git:** branch off `master`; small behavior-scoped commits prefixed `feat`/`fix`/`refactor`/`chore`/`docs`; end with the `Co-Authored-By: Claude …` trailer. Commit/push only when asked.

## Adding a content type (checklist)

1. Strapi schema in `apps/strapi-oyl` (`strapi ts:generate-types`, `as const`) + add to the `/bootstrap` controller.
2. Codec in `all-of-oyl/src/collections.ts`; add to `BACKED`/`CATALOG_BACKED`.
3. `pnpm php-app run import` (commit `camis.json` + `roles.json`); add the model to `overlay/routes/api-custom.php` `$collections`/`$serializers`.
4. `pnpm e2e` and `E2E_BACKEND=php pnpm e2e`.
5. **Before pushing to master:** sync the Strapi schema against the target DB (see `apps/camis-php-oyl/CLAUDE.md` → Deploy), or the CI deploy leaves the new api on the old schema.
