# camis-php-oyl — a camis-generated PHP backend for OYL

**Date:** 2026-09-08
**Status:** approved design; camis Phase 16 plan at
`camis/docs/superpowers/plans/2026-09-08-strapi-api-style.md`
**Repos touched:** `oyl` (this repo) and `camis` (sibling checkout at
`Repositories/com/github/hynding/camis`)

## Goal

Serve the OYL sync API from a PHP 8 app deployable to DreamHost shared hosting, with
**zero per-content-type code** in the PHP app. Every schema change made in
`apps/strapi-oyl` reaches the PHP backend through `camis import` + `camis build`; the
vanilla client works against either backend unchanged.

Success criterion: `E2E_BACKEND=php pnpm e2e` is green. The suite's hygiene fixture
already fails on any 4xx/5xx or console error, so a green run proves the PHP app serves
the same API as Strapi without any new test code.

## Non-goals (v1)

- Google OAuth / Drive linking. The client probes `GET /google/config` and degrades
  cleanly when it answers unconfigured; the 350-line OAuth controller stays Strapi-only
  until a later sub-project ports it as hand-written PHP in the overlay.
- Filament admin usage. The panel is generated for free but is not part of this scope.
- Replacing the Pi deployment. DreamHost is an additional target; nothing about the Pi
  path changes.

## Where the gaps are (verified 2026-09-08)

Camis Phases 11–15 already import every OYL content type and component, model the
builtin user relation, emit `upsertBy`-driven controllers, Ring 1 policies with
ownership conditions, and a shared-hosting DEPLOY.md. What the generated Laravel API
does **not** do yet is speak the Strapi wire protocol the client expects:

| # | Client expects (Strapi) | Generated Laravel today |
|---|---|---|
| 1 | `POST /auth/local`, `/auth/local/register` → `{ jwt, user }`; `GET /users/me` → bare `{ id, username, email }`; Bearer token | session `auth` middleware; no auth routes |
| 2 | `{ data: row }` / `{ data: [rows] }`; errors `{ error: { message } }` | bare model; paginator wrapper on index |
| 3 | camelCase fields, components nested (`amount.minor`), nulls omitted, numbers as numbers | snake_case columns, components flattened (`amount_minor`), nulls present |
| 4 | `PUT /notes/:recordId` upserts by domain id; POST creates | routes bind by numeric id |
| 5 | list = every row **in scope** (owner-only or public-or-mine), no pagination | unfiltered `paginate(50)`; policies gate per-record only |
| 6 | owner/creator filled from the authenticated user | caller must supply the FK |
| 7 | a health route (Strapi's is `GET /_health` at the root; e2e polls it) | absent |
| 8 | kebab-case plural paths: `/activity-sessions`, `/consumable-products` | snake table names: `/activity_sessions` |
| 9 | `PUT` upserts by `recordId` | `options.upsertBy` is never set by `camis import` (Strapi schema has no such concept), so the committed IR would need a hand edit that the next import clobbers |

Rows 2–9 are properties of *any* Strapi-replacing backend, not of OYL. They are therefore
camis features (Phase 16), not app code. The genuinely OYL-specific behaviors are small:
`GET /bootstrap`, UPC dedup on consumable-product, UPC-implies-public visibility, and a
`GET /google/config` that answers "unconfigured".

The strapi-oyl sanitize helpers (`strip-nulls`, `finance-money`, `nutrition-facts`) were
read in full: every rule is a consequence of nullable columns or database drivers returning
decimals/bigints as strings. MySQL under PDO does the same. So null-omission and numeric
casting belong in the generic serializer, not in OYL hooks.

## Architecture

Three parts, in dependency order.

```
camis (Phase 16: apiStyle "strapi")
   │  camis import strapi ../strapi-oyl  →  camis.json
   │  camis build                         →  laravel/ (git-ignored)
   ▼
apps/camis-php-oyl/            ← the seven committed files you maintain
   │  overlay/ mirrored into laravel/ after every build
   ▼
scripts/deploy-dreamhost.sh    ← rsync laravel/ + remote composer/artisan
```

### Part 1 — camis Phase 16: Strapi-compatible API style

A new target option on the filament target, `"apiStyle": "strapi"`, changes only the API
layer of the generated app. All emitters are golden-tested; regeneration stays idempotent.

**1a. Envelope, casing, shape.** A generated `App\Http\Serializers\<Model>Serializer` (one
per content type) produces the wire shape:

- camelCase keys (inverse of `snakeColumn`);
- non-repeatable components re-nested from their prefixed columns; repeatable components
  re-nested from their child tables (the inverse of `components.ts` flattening, recursive);
- keys whose value is `null` omitted, at every nesting level;
- numeric columns emitted as PHP int/float by the serializer itself (`(int)`/`(float)` on
  read; Laravel's `decimal:2` model cast returns a string, and changing model casts would
  alter the existing Laravel-style goldens);
- relation FKs (`owner_id`, `creator_id`) are **not** on the wire; the client never reads
  them. (`record.ownerId` in a grant condition is the Ring 1 record view from Phase 13,
  which is unrelated to the serialized shape.) Child-table bookkeeping columns (child `id`,
  parent FK, `position`) are likewise omitted; the parent row's `id`, `createdAt`,
  `updatedAt` are kept, as Strapi does;
- datetimes serialize as ISO 8601 UTC strings (Laravel's default Carbon serialization).

Controllers wrap responses as `{ data: ... }`. Index returns all rows in scope, no
paginator. Inbound bodies are accepted as `{ data: {...} }` and unfolded by the same
serializer in reverse (camelCase → columns, nested components → embedded columns / child
rows). Unknown keys are ignored.

Route paths are the kebab-case of the IR `names.plural` (which `camis import` fills from
Strapi's `pluralName`), so `/api/activity-sessions` rather than the table name.

**1b. Error shape.** An API exception renderer emits `{ error: { status, name, message } }`
for every 4xx/5xx on `api/*` routes (Strapi's shape). The client reads `error.message`.

**1c. Route key.** When `options.upsertBy` is set, `show`/`update`/`destroy` take the raw
`{key}` string and look the row up by that column **through the scope** (1d). Laravel's
implicit route-model binding is deliberately not used in this style: it would 404 before
the controller runs, which makes `PUT`'s create branch unreachable. Semantics match
strapi-oyl: `POST` creates (201); `PUT /:key` upserts — update if found in scope, else 404
if the key exists outside scope (never reach across owners), else create — and returns 200
on both branches. `camis import strapi` gains `--upsert-by <field>`, setting `options.upsertBy` on
every imported content type that has a unique field of that name, so the IR stays fully
regenerable.

**1d. Scoped lists from the grant condition.** New emitter: Ring 1 predicate → Eloquent
`where` closure, emitted as a `scopeForUser(Builder, User)` on each model that has a
`read` grant with a condition. Supported subset: `eq`, `and`, `or`, where each `eq`
compares `record.<field>` or `record.<relation>Id` against a literal or `user.id` of a
statically compatible type. `ne` and `not` are deliberately excluded: SQL three-valued
logic makes `NOT (col = 'x')` drop NULL rows that Ring 1 keeps. Any predicate outside the
subset falls back to fetch-then-filter through the existing Ring 1 PHP evaluator
(correct, slower) and is reported as a `downgrade` capability gap. `index()`, `show()`,
`update()`, `destroy()` all query through the scope; once a row is found, the action's own
generated policy (Phase 13) still authorizes it, so the read scope narrows visibility and
the policy decides the verb.

Conformance: the Ring 1 query emitter joins the existing conformance suite. For every
vector whose expression is in the subset, the evaluator result and the SQL result (against
SQLite) must agree; divergence fails the build.

**1e. Explicit assignment on create.** The grant shape gains
`assign?: Record<fieldName, "user.id">`. On `store()` (and the create branch of `PUT`) the
generated controller fills those FKs from the authenticated user. This is explicit rather
than inferred from the condition because catalog conditions are `or`-expressions and
inference would be ambiguous. `validateBundle` checks that each assigned field is an
owning relation to the builtin user.

**1f. Auth.** Sanctum personal access tokens (already installed by `install:api` in
`camis scaffold filament`). Emitted:

- migration adding a unique `username` column to `users`;
- `POST /api/auth/local` `{ identifier, password }` — identifier matches email **or**
  username — → `{ jwt, user: { id, username, email } }`;
- `POST /api/auth/local/register` `{ username, email, password }` → same shape; assigns
  the role named by the roles file's new top-level `defaultRole`;
- `GET /api/users/me` → bare `{ id, username, email }`;
- `GET /api/_health` → 204. Laravel's API routes carry the `/api` prefix and the scaffold
  owns `bootstrap/app.php`, so the route cannot sit at the root like Strapi's; the client
  never calls it, only the e2e boot script does, and that script polls `/api/_health`;
- API routes use `auth:sanctum` when roles are configured.

The `jwt` field carries an opaque Sanctum token, not a JWT. The client treats it as opaque.

**1g. Generated base + protected controller.** Each API controller is emitted twice: the
generated `App\Http\Controllers\Api\Generated\<Model>ApiController` (overwritten every
build) and a seed-mode `App\Http\Controllers\Api\<Model>ApiController extends
Generated\<Model>ApiController {}` that routes point at. Request-level behavior that an
observer hook cannot express (return an existing row instead of creating, as UPC dedup
needs) is an override of `store`/`update` in the protected subclass, calling `parent::`
for the normal path. The existing Ring 2 observer hooks stay for model-event behavior.

**1h. Protected overlay directory.** Project config gains `protected?: string` (a directory
relative to the config). After generation the CLI mirrors it into `out`, overwriting any
seed-mode defaults. This is what lets the generated Laravel app be git-ignored while the
hand-written seams stay committed.

Config additions (`packages/cli/src/config.ts`): `apiStyle: z.enum(["laravel","strapi"])
.optional()` on `targetConfig` (default `laravel`, preserving current output byte-for-byte);
`protected: z.string().optional()` on `projectConfig`. Roles file: top-level
`{ defaultRole?: string, roles: Role[] }` accepted alongside the current bare array.

### Part 2 — `apps/camis-php-oyl` (this repo)

Workspace member `@oyl/camis-php-oyl`. Committed files:

| File | Purpose |
|---|---|
| `package.json` | `"@camis/cli": "link:../../../camis/packages/cli"`; scripts `import`, `roles`, `build`, `dev`, `deploy` |
| `camis.config.json` | `ir: ./camis.json`, `roles: ./roles.json`, `protected: ./overlay`, one target `{ target: filament, out: ./laravel, apiStyle: strapi }` |
| `camis.json` | IR produced by `pnpm php-app import` from `../strapi-oyl`; committed so schema changes appear as reviewable diffs |
| `roles.json` | **generated** by `scripts/generate-roles.ts` from `@oyl/all-of-oyl` `KINDS` + `camis.json`; committed for the same reason |
| `overlay/routes/api-custom.php` | `GET /bootstrap` — every collection queried through the generated `forUser` scopes, keyed by REST plural path, serialized through the generated serializers; `GET /google/config` → `{ configured: false }` so the client's pre-auth probe never 4xxs |
| `overlay/app/Http/Controllers/Api/ConsumableProductApiController.php` | overrides `store`/`update`: UPC dedup (return the existing row when a UPC already exists) and UPC-implies-`public` visibility; everything else `parent::` |
| `.env.example` | DB + `APP_URL` (Laravel's default CORS config already allows every origin on `api/*`; Bearer auth needs no credentials, so no CORS env is required) |

`roles.json` derivation (one role, `authenticated`, also the `defaultRole`). A content type
in `camis.json` maps to its `KINDS` key by `camelCase(kebab(names.plural))`
(`ActivitySessions` → `activity-sessions` → `activitySessions`); an unmapped type is a
generator error. For each content type whose collection is `personal` in `KINDS`, grant
`create/read/update/delete` with condition `record.ownerId == user.id` and
`assign: { owner: "user.id" }`; for `catalog`, condition
`record.visibility == "public" || record.creatorId == user.id` and
`assign: { creator: "user.id" }`. Content types with neither an `owner` nor a `creator`
relation (e.g. `google-account`) get no grant and are therefore unreachable via the API.
A unit test asserts every backed collection in `KINDS` has a grant, so adding a type to
strapi-oyl and `collections.ts` without re-running `pnpm php-app roles` fails CI.

Scripts:

- `import` — `camis import strapi ../strapi-oyl --upsert-by recordId --out camis.json`,
  then `pnpm roles`, so the IR and the roles derived from it are always regenerated together
- `roles` — `tsx scripts/generate-roles.ts` (also runnable alone)
- `build` — `camis scaffold filament ./laravel` when `laravel/composer.json` is missing,
  then `camis build`
- `dev` — `php artisan serve --port 1340` inside `laravel/` (same port as Strapi native,
  so the client's Connection setting is unchanged; never run both)
- `deploy` — `bash ../../scripts/deploy-dreamhost.sh`

Git-ignored: `laravel/` entirely. A fresh clone runs `pnpm install && pnpm php-app build`.

Root `package.json` gains `"php-app": "pnpm --filter @oyl/camis-php-oyl"`.

### Part 3 — deploy and e2e

**`scripts/deploy-dreamhost.sh`** mirrors `deploy-pi.sh` conventions: config from
`OYL_DH_SSH`, `OYL_DH_APP_ROOT`, `OYL_DH_SITE_URL` in the untracked root `.env` (never
hard-coded); `--dry-run`; deploys committed HEAD. Steps: local `pnpm php-app build`;
rsync `laravel/` excluding `vendor/`, `.env`, `storage/*.sqlite`, `node_modules/`; remote
`composer install --no-dev --optimize-autoloader`, `php artisan migrate --force`,
`php artisan db:seed --class=RolePermissionSeeder --force`, `php artisan config:cache`;
health check `GET $SITE_URL/api/_health`.

One-time manual DreamHost steps (documented in the app README): create the MySQL database
in the panel; set the API domain's web directory to `<APP_ROOT>/laravel/public`; confirm
PHP 8.x with `ext-intl` enabled (Filament requires it); write `laravel/.env` on the host and
run `php artisan key:generate --force` once; make `storage/` and `bootstrap/cache/` writable
by the PHP user.

**e2e switch.** `apps/e2e-oyl/scripts/start-php-backend.mjs`: delete the e2e SQLite file,
`php artisan migrate --force` + seeder with `DB_CONNECTION=sqlite`, then
`php artisan serve --port $E2E_BACKEND_PORT`. `playwright.config.ts` picks it when
`E2E_BACKEND=php` and polls `/api/_health` instead of `/_health`. `google-auth.spec.ts`
opts out under the PHP backend with `test.skip(process.env.E2E_BACKEND === 'php', …)`,
the same `test.skip(condition, reason)` form the mobile/desktop specs already use; the
fake-google server still starts and is simply unused.

## Data flow (one request)

`PUT /api/notes/abc123` with `{ data: { text, occurredAt } }` and a Bearer token →
`auth:sanctum` resolves the user → `Api\NoteApiController::update('abc123')` (the
protected subclass, delegating to the generated base) → `Note::forUser($user)` scope
(`where owner_id = ?`) `->where('record_id', 'abc123')` → found: unfold body to columns,
save; not found and `record_id` claimed elsewhere: 404 `{ error }`; else create with
`owner_id = user.id` →
`NoteSerializer` → `{ data: { recordId, text, occurredAt, createdAt, updatedAt } }`.

## Error handling

- Fail closed: a content type with no grant is 403 on every route.
- Predicates outside the query subset are evaluated in PHP, never dropped.
- Validation errors (missing required field) → 400 `{ error: { name: "ValidationError",
  message } }`.
- Unique violations on `upc` under concurrent creates → the controller override re-reads
  and returns the winner (same convergence rule as strapi-oyl).

## Testing

| Layer | Test |
|---|---|
| camis emitters | golden files per new emitter; idempotent regen; `apiStyle` absent ⇒ existing goldens unchanged |
| Ring 1 → SQL | conformance vectors evaluated both ways against SQLite |
| camis API | PHP round-trip test: register → login → create/upsert/list/delete → cross-owner PUT 404 |
| `roles.json` | unit test: every `KINDS` collection present in `camis.json` has a grant; generated file is byte-stable |
| OYL end-to-end | `E2E_BACKEND=php pnpm e2e` green on desktop + mobile |

## Risks

- **Serializer inverse must be exact.** Any drift between flattening and re-nesting shows
  up as a client decode error; the golden tests plus e2e catch it, but the e2e run is the
  only proof for repeatable components (`activity.quantity`).
- **Shared-hosting performance.** Fetch-then-filter fallback is O(rows); OYL lists are
  per-user and small. Acceptable; the gap report makes it visible.
- **DreamHost `ext-intl`.** If absent on the account, Filament's panel will not boot; the
  API does not depend on it. Verify before first deploy.
- **`link:` requires the sibling camis checkout to have run `pnpm install`.** Documented
  in the app README.

## Sequencing

1. camis Phase 16 (all of Part 1), TDD, in the camis repo — its own implementation plan.
2. `apps/camis-php-oyl` + `generate-roles` + overlay (Part 2).
3. e2e switch; iterate until `E2E_BACKEND=php pnpm e2e` is green.
4. `deploy-dreamhost.sh` + first deploy.
