# Strapi storage layout — one database for strapi-oyl and camis-php-oyl

**Date:** 2026-09-08
**Status:** design under review
**Repos touched:** `camis` (Phase 17, the bulk of the work) and `oyl` (e2e gate, deploy, docs)
**Builds on:** `2026-09-08-camis-php-oyl-design.md` (the PHP backend that speaks the Strapi wire
protocol) — this spec makes the two backends share *storage*, not just an API contract.

## Goal

Either backend can serve the same data at any time. A row written through Strapi is read by the
PHP app and vice versa; a user registered on one signs in on the other; a token issued by one is
accepted by the other. Acceptance: the existing oyl browser suite passes against the PHP backend
running on a database that Strapi created and seeded, and a cross-check proves reads and writes
in both directions.

## Decisions already taken (2026-09-08)

- **Strapi owns the schema.** camis emits no content migrations in this layout; Laravel maps onto
  tables Strapi created. A new database is initialized by booting Strapi against it once, and
  again after every schema change.
- **Sessions survive a swap.** Laravel issues and verifies Strapi-compatible JWTs (HS256, payload
  `{ id }`, 30-day expiry, the shared `JWT_SECRET`) instead of Sanctum tokens.
- **Grants stay in camis's `roles.json`; role membership comes from Strapi's tables.** Strapi's
  `up_permissions` rows carry only action flags and no conditions, so they cannot be the source.
- **No admin panel in this layout.** Filament resources are not emitted (reported as a
  `downgrade` gap); the target is headless.

## Non-goals (v1)

- Relations other than `manyToOne`/`oneToOne` to the builtin user (`manyToMany`, `oneToMany`
  owners), `media`, and `dynamicZone` fields — `error` gaps. OYL uses none.
- Draft/publish workflows — types with `draftPublish` are a `downgrade` gap: only published rows
  are visible; writes set `published_at`.
- Google OAuth (still Strapi-only) and Strapi's admin users (`created_by_id`/`updated_by_id`
  stay null on rows the PHP app writes, exactly as they are on API-created rows today).
- Email confirmation and password-reset emails: with `CAMIS_EMAIL_CONFIRMATION=true` the PHP
  app registers users as unconfirmed for parity but sends nothing; those flows remain Strapi's.
- Emitting the Strapi schema from camis — rejected in favour of Strapi owning it.

## Strapi 5 physical layout (verified against `apps/strapi-oyl/.tmp/e2e.db`, 2026-09-08)

| Concept | Strapi table / column | Notes |
|---|---|---|
| Content type | `<collectionName>` e.g. `activity_sessions` | IR already carries `names.collection` |
| Row bookkeeping | `id`, `document_id` (cuid2, 24 chars), `created_at`, `updated_at`, `published_at`, `created_by_id`, `updated_by_id`, `locale` | `published_at` is set even when draft/publish is off; index `(document_id, locale, published_at)` |
| `manyToOne`/`oneToOne` to user | `<collectionName>_<relation>_lnk` with `<singular>_id`, `user_id` | e.g. `notes_owner_lnk(note_id, user_id)`; unique on the pair; an `<owner singular>_ord` column exists only when the relation has an inverse (`up_users_role_lnk.user_ord`) |
| Non-repeatable component | `<collectionName>_cmps(entity_id, cmp_id, component_type, field, order=NULL)` + `components_<category>_<collectionName>` | `component_type` = `finance.money`; component table from the component file's `collectionName` (`components_finance_money`, `components_activity_quantities`) |
| Repeatable component | same, `order` = 1..n | |
| Nested component | `components_<…>_cmps` on the parent component table | e.g. `components_nutrition_nutrition_facts_cmps` → serving size / additional nutrients |
| Users | `up_users(id, document_id, username, email, provider, password, reset_password_token, confirmation_token, confirmed, blocked, …)` | bcrypt `$2a$`; `up_users_role_lnk(user_id, role_id, user_ord)`; `up_roles(type = authenticated|public)` |
| Datetimes | SQLite: integer milliseconds in a `datetime`-declared column; MySQL `datetime(6)`; Postgres `timestamp(6)` | |
| Uniqueness | **Not enforced by the database.** No unique index on `record_id`, `up_users.email`, or `username` | Strapi validates in application code |
| JWT | `jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' })`, verified with an explicit `algorithms` list (HS256 expected) | payload also carries `iat`/`exp` |
| Schema sync | drops only tables recorded in `strapi_database_schema` | Laravel-owned tables are never touched |

## Architecture

### camis Phase 17 — `storageLayout: "strapi"` on the filament target

Requires `apiStyle: "strapi"` (config validation error otherwise). Changes the model layer and
auth; reuses serializers, controllers, scopes, `StrapiErrors`, and routes from Phase 16.

**17a. IR addition (neutral).** `Component` gains `names?: { collection?: string; group?: string }`.
The Strapi importer fills `collection` from the component file's `collectionName` and `group` from
its folder (`finance`). Adapters derive Strapi's `component_type` as `${group}.${kebab(name)}`
(`nutrition.nutrition-facts`). Existing goldens are unaffected (the field is optional).

**17b. Models.** `App\Models\<Type>` with `$table = names.collection`, no `$timestamps` override
(Strapi uses `created_at`/`updated_at`), `StrapiDateTime` casts on every datetime column, `array`
casts on json, `boolean` on booleans. Each owning relation to the user emits a `belongsToMany`
through `<table>_<relation>_lnk` with the derived pivot columns, plus a `<relation>Id` accessor
that resolves to the single linked user id (so the Ring 1 record view `record.<relation>Id` and
the policies keep working). `scoped()` eager-loads every owning relation (`->with([...])`) so
the per-row policy check does not add a query per row. The user model is `App\Models\User` on
`up_users` with `username`, `email`, `password`, `provider`, `confirmed`, `blocked`, a `role()`
accessor through `up_users_role_lnk` → `up_roles`, and no Sanctum/Spatie traits. Unlike the
Laravel layout (where the stock `User` belongs to the host app), in this layout camis **owns and
overwrites** `app/Models/User.php` (generated marker), because the class must map onto
`up_users`.

**17c. Row lifecycle helper (`App\Support\StrapiRows`).** `create(Model $m)` fills `document_id`
(cuid2, 24 chars, via `visus/cuid2`), `published_at = now()`, `locale = null`, and saves;
`link(Model $m, string $relation, int $userId)` inserts the `_lnk` row (with `<singular>_ord`
= max + 1 only when the IR relation has an `inverse`); `unlink` for deletes. The generated
controllers call these instead of bare `save()`/FK assignment; deletes remove `_lnk`, `_cmps`,
and component rows in the same transaction.

**17d. Components (`App\Support\StrapiComponents`).** Phase 16 serializers read flattened
columns (`$m->amount_minor`) and child relations (`$m->quantities`); neither exists in Strapi's
tables. The loader materializes exactly those names: `load(Collection $rows)` fetches the `_cmps`
rows for all ids in one query and each component table in one query, recursing into nested
`_cmps`, then sets the flattened attributes on each model (`amount_minor`, `amount_currency`,
`facts_serving_size_amount`, …) and `setRelation('<field>', Collection)` for repeatables. So the
serializers are reused byte-for-byte. Loading is **lazy with an optional preload**: the model's
`components()` accessor loads for that single row if nothing was preloaded; controllers preload
per page with `load($rows)`; hand-written code that forgets to preload is correct but N+1 — which
is what lets the OYL overlay stay unchanged. `apply(Model $m, array $wire)` (called instead of
`fill` for the embedded/child keys `fromWire` produces) deletes the affected fields' `_cmps` +
component rows — recursively for nested components — and inserts the new ones with `order` for
repeatables, inside the request's `DB::transaction`; unmentioned component fields are untouched
(same partial-update semantics as Phase 16).

**17e. List scope.** The Ring 1 query emitter renders `record.<relation>Id == user.id` as
`whereExists(select 1 from <lnk> where <singular>_id = <table>.id and user_id = ?)`; other
supported predicates are unchanged. `and`/`or` compose as before.

**17f. Uniqueness in code.** Because Strapi enforces `unique` in its validator, not the database:
`store()` on a type with `upsertBy` returns 400 `ValidationError` when the key already exists;
registration rejects an existing email or username with 400. The check-then-insert race is
inherent parity with Strapi and is documented.

**17g. Auth.** `App\Http\Middleware\StrapiJwtGuard` verifies `Authorization: Bearer` with
`firebase/php-jwt` (HS256 only, `JWT_SECRET` from env) and loads `up_users` by `id`, rejecting
`blocked` users (401). `AuthController::login` finds by email or username, checks `blocked` and
`confirmed` like Strapi, verifies bcrypt, issues `{ jwt, user }` with a 30-day `exp`.
`register` writes `provider = 'local'`, `confirmed = ! CAMIS_EMAIL_CONFIRMATION` (default
`false` → confirmed), `blocked = false`, `document_id`, `published_at`, hashes with bcrypt
(`$2y$`, which bcryptjs accepts), inserts the `up_users_role_lnk` row for the `up_roles` row
whose `type` equals `defaultRole` with `user_ord = max + 1` (this relation is Strapi-internal,
not in the IR, so the auth emitter hard-codes it), and issues a token. Parity on failures: like
Strapi, a blocked account and an unconfirmed account are **400** `ValidationError` with Strapi's
messages ("Your account has been blocked by an administrator", "Your account email is not
confirmed"); bad credentials stay 400 "Invalid identifier or password". `/users/me` is unchanged.
Sanctum is not installed by the scaffold in this layout.

**17h. Authorization.** The generated policy's `$user->can('<key>')` (Spatie) becomes a
role-type membership test: the permission projection already knows which roles hold each key,
so the policy emits `in_array($user->roleType(), ['authenticated'], true)`. `roles.json` role
names must equal `up_roles.type` values. The Ring 1 record view reads `record.<relation>Id`
from the model accessor (`$record->ownerId`) instead of an FK column — a layout switch in the
policy emitter. No Spatie tables, no seeder. Conditions and `assign` behave exactly as in
Phase 16 (`assign` → `StrapiRows::link`).

**17i. Datetimes.** `App\Casts\StrapiDateTime`: on the `sqlite` driver reads and writes epoch
milliseconds; on `mysql`/`pgsql` reads and writes native timestamps in UTC. Applied to
`created_at`, `updated_at`, `published_at`, and every IR `dateTime`/`timestamp` field. IR `date`
and `time` fields are passed through as strings until Strapi's storage for them is verified
against a real row (OYL has none); recorded as a follow-up.

**17j. Emission set.** Models (including the owned `User`), `StrapiRows`, `StrapiComponents`, `StrapiDateTime`,
`StrapiJwtGuard`, `AuthController`, serializers, controllers (base + protected seed), routes,
`StrapiErrors`, `config/camis.php`, `DEPLOY.md`, and a **regenerated** (overwrite-mode)
`camis:strapi-schema-check` artisan command whose expected table/column list is derived from the
IR on every build; it exits non-zero on any missing table or column (used by deploy). Not
emitted: content migrations, the `username` migration, Filament resources, the Spatie seeder.

**17k. Scaffold.** `camis scaffold filament --storage strapi` skips Filament and Spatie, installs
`firebase/php-jwt` and `visus/cuid2`, and does not run `install:api`.

### Testing (camis)

- Goldens for every new emitter; `storageLayout` absent ⇒ every existing golden byte-identical.
- Unit tests for the Ring 1 → `whereExists` rendering and for `StrapiDateTime` per driver.
- **Cross-backend check (gated CI job).** camis's own Strapi target generates a Strapi 5 project
  from a fixture IR that includes a nested component (facts → serving size) and a repeatable;
  the job boots it once against a SQLite file to create the schema, registers a user and writes
  one row of every type through the Strapi API, stops Strapi, boots the PHP app on the same file,
  and asserts through HTTP: the Strapi-issued token is accepted, every row reads back with the
  Strapi wire shape, a row written through PHP is then read through Strapi (boot Strapi again),
  and a PHP-issued token is accepted by Strapi's `/users/me`. Any divergence fails the job.

### oyl side

- `camis.config.json`: add `storageLayout: "strapi"`; regenerate (`pnpm php-app build`). The
  existing `laravel/` scaffold needs no re-scaffold: Sanctum's leftover table and package are
  inert once the routes use the JWT guard, and Filament/Spatie simply stop being emitted. The
  overlay is unchanged: the
  `/bootstrap` route's `forUser` → `can('view')` → serializer chain works through the lazy
  component loader; adding a `StrapiComponents::load($rows)` preload per collection there is an
  optional optimization.
- **e2e:** `E2E_STORAGE=strapi` (with `E2E_BACKEND=php`) makes `start-php-backend.mjs` first
  run the existing `start-backend.mjs` (which deletes and recreates the Strapi e2e database and
  seeds the roles through Strapi's bootstrap), wait for Strapi's `/_health`, stop it, and then
  start the PHP backend on **that** file — skipping its own delete/migrate/seed steps — with
  `JWT_SECRET` identical to Strapi's e2e value (`e2e-test`). The suite runs unchanged. Without
  `E2E_STORAGE`, the current Laravel-owned SQLite path keeps working until the shared layout
  becomes the default.
- **Deploy:** `deploy-dreamhost.sh` runs `php artisan camis:strapi-schema-check` on the host
  after `composer install` and fails fast if tables are missing. `.env.example` gains
  `JWT_SECRET` (must equal Strapi's) and `CAMIS_EMAIL_CONFIRMATION=false`, and drops
  `SANCTUM_TOKEN_EXPIRATION`.
- **DreamHost schema init (documented one-time and per-schema-change step):** boot Strapi with
  `DATABASE_CLIENT=mysql` pointed at the DreamHost MySQL (remote access must be allowed for the
  originating host in the panel, or run from a host inside DreamHost) until healthy, then stop it.
- Docs: CLAUDE.md package row, README, the content-type checklist (schema change ⇒ Strapi
  sync before PHP deploy).

## Data flow (one request)

`PUT /api/transactions/abc` with `{ data: { amount: { minor: 1234, currency: "USD" } } }` →
`StrapiJwtGuard` verifies the token and loads the `up_users` row → controller scopes
`transactions` by `whereExists(transactions_owner_lnk …)` → found: `DB::transaction` {
`StrapiComponents::apply($m, $wire)` deletes the old `_cmps` + `components_finance_money`
rows for `amount` and inserts new ones; `$m->save()` } → serializer → `{ data: { recordId, amount: { minor,
currency, exponent }, … } }`. Strapi reading the same row sees a normal component.

## Error handling

- Missing or unknown table at boot → `camis:strapi-schema-check` fails deploy; at runtime a
  `QueryException` maps to 400 as today, so a half-synced schema is loud on the first request.
- Duplicate `recordId`/email/username → 400 `ValidationError` (parity with Strapi).
- Blocked or unconfirmed user at login → 400 `ValidationError` with Strapi's messages (the
  client shows `error.message`); a blocked user presenting a valid token → 401.

## Risks

- **`_cmps` polymorphism.** The link rows reference component tables by `component_type`
  string; the emitter derives it from the new IR `names.group`. A mismatch shows up immediately
  in the cross-check (Strapi would not see PHP-written components).
- **Nested components have never been exercised with data** in any OYL database. The camis
  cross-check fixture covers it; the oyl suite may not until a consumable with a serving size is
  created.
- **JWT `algorithms` list** in Strapi's verifier was not visible in the compiled plugin; the
  cross-check settles it empirically. If Strapi rejects PHP-minted tokens, the fallback is
  matching whatever header fields it requires.
- **SQLite millisecond datetimes** are only a test/dev concern, but a wrong cast there would make
  the e2e gate lie; the per-driver unit test guards it.
- **Two writers, one autoincrement.** Fine by construction (the database owns `id`), but both
  backends must never run schema sync concurrently — only Strapi ever alters the schema.

## Sequencing

1. camis Phase 17 (17a–17k + camis cross-check), TDD, its own plan.
2. oyl: config flip, e2e `E2E_STORAGE=strapi`, deploy check, docs; gate green.
3. First shared-database deploy: Strapi sync against DreamHost MySQL, then `pnpm deploy:dreamhost`.
