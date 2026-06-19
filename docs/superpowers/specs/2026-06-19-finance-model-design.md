# Finance Model (Sub-project B-Finance) — Design

**Status:** approved (design) — 2026-06-19
**Predecessor:** B1 nutrition model (merged); sub-project A online-first data layer.
**Roadmap source:** root `TODO.md` — "User Finance Account / User Finance Transaction"; "rely less on JSON fields and more on a pragmatic, relational database structure."

## Goal

Give the existing Finance domain (`Account`, `Transaction`, `Budget`) real relational
Strapi backends and unstub their per-collection repos, so transactions logged in the app
flush to the backend, persist owner-isolated, and read back — with budgets aggregating
them. No new app UI: the finance composer/stores already build and read these domain
objects against (currently stubbed) repos.

## Background / current state

- Domain core already models finance: `core/money.ts` (`Money {minor:int, currency, exponent}`),
  `finance/account.ts` (`Account {name, currency}`; balance is net-of-recorded), `finance/transaction.ts`
  (`Transaction extends Entry`, kind `transaction`: `amount:Money`, `category:slug`, `direction:'expense'|'income'`,
  `accountId?`), `goal/budget.ts` (`Budget {name?, category:slug, limit:Money}`, sugar over the goal engine).
- `collections.ts`: `accounts`, `transactions`, `budgets` are all registered (`classCodec(...)`) and all `'personal'` (owner-scoped).
- `apps/vanilla-oyl/src/storage/bootstrap.js`: `PATH_BY_COLLECTION` maps `accounts→'accounts'`, `transactions→'transactions'`, `budgets→'budgets'`; `ROW_KIND_BY_COLLECTION` maps `transactions→'transaction'` (Entry discriminant). `BACKED = {notes, consumptions}` — so `accounts`/`transactions`/`budgets` currently resolve to `emptyRepo()` stubs.
- App finance surface already exists and consumes the stubs: `state/accounts-store.js`, `state/budgets-store.js`, `components/oyl-finance.js`, `components/oyl-finance-composer.js`. The journal-store routes a logged `Transaction` (kind `transaction`) to `reposByKind['transaction']` = `repos.transactions`.
- Strapi backend has `note` (owner-scoped) + `activity`/`consumable`/`consumable-product` (catalog) + `consumption` (owner-scoped) content-types and the `nutrition.*` components, the `strapiRowToShape` read adapter, the shared owner-scoped/`documents()` controller patterns, and the `nutrition-facts` util — all reusable templates here.

## Architecture

Three **owner-scoped (personal)** Strapi content-types + one shared **`finance.money` component**,
then expand `BACKED` so the existing stores hit the backend. Reuse B1's backend patterns verbatim:

- **Owner-scoped controller** (template = `api/note` + `api/consumption`): every read/write filters
  `owner:{id:owner}`; `owner` server-stamped (never client-settable); PUT upsert-by-`recordId`
  (find `{recordId, owner}`→update; else if `{recordId}` claimed by anyone→404; else create);
  `delete` owner-scoped→404 otherwise; 401 unauthenticated. Client never sees Strapi's numeric id.
- **Component handling** (template = `api/consumable` + the `nutrition-facts` util): for content-types
  carrying a Money component (`transaction`, `budget`), use `strapi.documents()` for CRUD + a populate
  spec + a sanitize on read; `db.query` only for `recordId→documentId` lookups. `account` has no
  component → simple `db.query` controller (note-style).
- **Type registration:** after creating a content-type, run `strapi ts:generate-types` (NOT just
  `strapi build`) to register the UID, then `as const` (no `as any`). `strapi build` preserves it.

### F.1 — `finance.money` shared component + `finance-money` util

`apps/strapi-oyl/src/components/finance/money.json`:
- `minor`: **`biginteger`** — overflow-safe (a `decimal`/`integer` would silently cap, a real risk for
  large-denomination currencies). Negative values allowed (refund = negative expense).
- `currency`: `string`.
- `exponent`: `integer`.

This mirrors domain `Money` exactly (`{minor, currency, exponent}`), so it round-trips verbatim — the
Strapi component id is harmlessly ignored by `Money.fromJSON` (it reads only `minor/currency/exponent`).
Reused by `Transaction.amount` and `Budget.limit`.

`apps/strapi-oyl/src/utils/finance-money.ts` (parallels `nutrition-facts.ts`):
- `moneyPopulate(field)` → `{ [field]: true }` (component populate for `documents()` reads); export
  `AMOUNT_POPULATE = moneyPopulate('amount')`, `LIMIT_POPULATE = moneyPopulate('limit')`.
- `sanitizeMoney(row, field)` → coerce `row[field].minor` from string→number (Strapi `biginteger`
  returns a **string**; `Money.fromJSON` requires `typeof minor === 'number'` and throws `MALFORMED_JSON`
  otherwise). Leave `currency` (string) and `exponent` (number) as-is. Strip a `null` component (absent).
  Reuse the `coerceNumeric` logic from the nutrition util — **extract a shared `coerceNumeric` into a
  common module** (e.g. `src/utils/coerce.ts`) that both `nutrition-facts.ts` and `finance-money.ts`
  import, rather than duplicating it.
- **Consistency rule (load-bearing):** `sanitizeMoney` MUST be applied on **every** read path that returns
  a money-bearing row — `find` (map), `findOne`, AND the `create`/`update` response bodies. Unlike B1's
  decimal coercion (a Postgres-only path SQLite never exercised), `biginteger` returns a **string on BOTH
  SQLite and Postgres**, so a missing `sanitizeMoney` breaks `Money.fromJSON` immediately — which means the
  booted Money round-trip test (decoding through the real codec) genuinely covers the coercion end-to-end.
  This is a strength: the coercion cannot silently rot.

### F.2 — `account` content-type (owner-scoped, no component)

`apps/strapi-oyl/src/api/account/...`:
- schema: `recordId`(string, required, unique), `name`(string, required), `currency`(string),
  `owner`(relation manyToOne `plugin::users-permissions.user`). `draftAndPublish:false`.
- controller: clone `api/note`'s owner-scoped `db.query` controller (no component); fields `name`,
  `currency`. UID `as const`.
- routes: `createCoreRouter('api::account.account')`. grant `account` actions to `authenticated`.

### F.3 — `transaction` content-type (owner-scoped Entry, Money component)

`apps/strapi-oyl/src/api/transaction/...` — completes the stubbed `transactions` per-kind repo:
- schema: `recordId`(req+unique), `occurredAt`(datetime, required), `note`(string),
  `amount`(component `finance.money`, required), `category`(string — slug), `direction`(enumeration
  `["expense","income"]`), `accountId`(string — plain domain id, like `areaId`/`consumableId`, NOT a
  relation), `owner`(relation). No `kind` column (injected on read). No positivity constraint on amount.
- controller: owner-scoped (note gate) + `documents()`/component handling (consumable template):
  every read path (`find`/`findOne` AND `create`/`update` returns) populates `AMOUNT_POPULATE` and returns
  `sanitizeMoney(row,'amount')`; `create`/`update` store `amount` verbatim (component), upsert-by-recordId
  owner-scoped. `direction` is always client-supplied (no schema default needed). UID `as const`.
- routes + grant. `ROW_KIND_BY_COLLECTION.transactions = 'transaction'` already wired → bootstrap injects
  `kind` so `Transaction.fromJSON`'s `parseEntryBase(shape,'transaction')` validates.

### F.4 — `budget` content-type (owner-scoped standalone, Money component)

`apps/strapi-oyl/src/api/budget/...`:
- schema: `recordId`(req+unique), `name`(string — optional), `category`(string — slug),
  `limit`(component `finance.money`, required), `owner`(relation). NOT an Entry (no `kind`/`occurredAt`).
  No `owner+category` unique constraint (domain allows multiples).
- controller: owner-scoped + `documents()`/component (`LIMIT_POPULATE`, `sanitizeMoney(row,'limit')`).
  UID `as const`. routes + grant.

### F.5 — App wiring + e2e/test-strengthening

- `bootstrap.js`: `BACKED` += `accounts`, `transactions`, `budgets` → real `createServerPersonalRepository`.
  No other bootstrap change (paths + `ROW_KIND` already present). Non-Entry `accounts`/`budgets` decode via
  plain `strapiRowToShape(row)` (no kind); `transactions` via `strapiRowToShape(row,{kind:'transaction'})`.
- No app-UI rework: `accounts-store`/`budgets-store` (over `repos.accounts`/`repos.budgets`) and the
  journal-store's transaction routing now hit the backend automatically.
- Strengthen vanilla tests (fakes): logging a `Transaction` enqueues to `reposByKind['transaction']`
  specifically (not other kinds); `accounts`/`budgets` persist + round-trip; `transactionsIn`/budget
  aggregation reflect logged transactions; Money round-trips (incl. a negative-amount refund).
- **Bootstrap read-decode test** (parallels B1's consumption decode test): a kind-less Strapi transaction
  row with a `biginteger`-**string** `amount.minor` decodes via `repos.transactions.list()` to a real
  `Transaction` with the correct numeric `Money` — proving `ROW_KIND='transaction'` injection AND
  `sanitizeMoney` coercion through the real BACKED repo end-to-end.
- Each content-type gets a booted owner-scoping test (owner-isolated, A-sees/B-doesn't, cross-owner
  PUT/DELETE 404, upsert-by-recordId, 401 unauth) + a `Money` round-trip decode
  (`Account.fromJSON`/`Transaction.fromJSON`/`Budget.fromJSON` via `strapiRowToShape`), and a parity
  assertion (`kindOf` personal + schema shape, money component ref, no creator/visibility).

## Decisions & non-goals (reviewed)

- **Money `minor` = `biginteger` + string→number coercion** (overflow-safe; reuses the B1 Postgres-decimal
  coercion pattern). `Number()` is exact to 2⁵³ ≈ $90T-in-cents — ample.
- **Money stored as a component** (not flat columns, not json): verbatim round-trip, no flat-column
  `extra`-leak, reuses B1's `documents()`+populate+util pattern, fully relational/queryable.
- **`category` = free-form slug** (matches the domain). A relational `Category` catalog content-type is a
  recommended **future follow-up** (better honors the relational intent; enables curated category pickers)
  — deferred to keep scope tight.
- **No backend currency-match enforcement** between `account.currency` and `transaction.amount.currency`
  — the domain enforces it at construction with the full account object; the backend trusts validated wire
  data (same posture as `consumableId` provenance).
- **`accountId` = plain string** (domain id, like `areaId`) — no FK relation, no referential integrity by
  design (offline-first, domain-generated ids).
- **No `Budget` per-category uniqueness** server-side (matches the domain). A `owner+category` unique
  constraint is a possible future curation policy.
- **Negative `transaction.amount` allowed** (refund = negative expense; the seed exercises one). No schema
  positivity constraint. (`Budget.limit > 0` is domain-validated, not schema-enforced.)
- **Account/Budget are standalone (non-Entry) personal records** → no `ROW_KIND` injection; only
  `Transaction` (an Entry) needs `kind='transaction'`.
- **Clean break, no migration:** the finance collections were stubs (no real backend data); the fixture
  seed already produces accounts/transactions/budgets in the per-kind seed arrays.

## Deferred

`Category` relational catalog; finance reporting/analytics UI; multi-currency conversion; opening-balance
fields; the broader B3 catalog-curation policy; the remaining stubbed kinds (`measurements`,
`activitySessions`) — their own future sub-projects.

## Reuse of existing infrastructure

`strapiRowToShape` (recordId→id + kind injection); owner-scoped controller template (`note`/`consumption`);
`documents()`+populate+sanitize component pattern + the util shape (`nutrition-facts.ts` → `finance-money.ts`);
`strapi ts:generate-types`→`as const`; the parity-test + booted owner-scoping test harness; the per-kind
journal-store routing and bootstrap `BACKED`/`PATH`/`ROW_KIND` maps.

## Manual acceptance (after implementation)

Backend + app (fresh DB), signed in: create an `Account`; log a `Transaction` against it (incl. a refund =
negative expense) → it flushes to `/api/transactions`, persists owner-isolated, and reads back with exact
`Money`; create a `Budget` for a category → it aggregates the month's transactions (spent/remaining/progress).
Confirm a second user does not see the first user's accounts/transactions/budgets (owner isolation).
