# Finance Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Account`, `Transaction`, `Budget` real owner-scoped Strapi backends + unstub their repos, so logged transactions flush to the backend, persist owner-isolated, and budgets aggregate them — no app-UI rework.

**Architecture:** Three owner-scoped (personal) Strapi content-types + one shared `finance.money` component, reusing B1's patterns verbatim (owner-scoped `note`/`consumption` controller; `documents()`+populate+sanitize for component-bearing types; `strapiRowToShape`; `ts:generate-types`→`as const`; parity + booted owner-scoping tests). Then `BACKED += {accounts, transactions, budgets}`.

**Tech Stack:** Strapi 5 (TS), `@oyl/all-of-oyl` domain core, vanilla-oyl app (JSDoc), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-finance-model-design.md`

## Global Constraints

- **Owner-scoped security (every content-type here):** every read/write filters `owner:{id:owner}`; `owner` is server-stamped and NEVER read from the client body; PUT upserts by domain `recordId` (find `{recordId,owner}`→update; else if `{recordId}` claimed by anyone→404; else create); `delete` owner-scoped→404 otherwise; 401 when unauthenticated. The client never sees Strapi's numeric id (responses key on `recordId`/domain id).
- **Money:** stored as the shared `finance.money` component (`minor`:`biginteger`, `currency`:`string`, `exponent`:`integer`); negative `minor` allowed (refunds); no positivity constraint. `biginteger` returns a **string** (both SQLite + Postgres) → `sanitizeMoney` coerces `minor`→number on EVERY read path (find/findOne/create/update returns), else `Money.fromJSON` throws `MALFORMED_JSON`.
- **`accountId` is a plain string** domain id (like `areaId`), not a relation. **`category` is a free-form slug** string. No server-side currency-match enforcement; no `Budget` uniqueness constraint.
- **Strapi typegen:** after creating a content-type, run `strapi ts:generate-types` (NOT just `strapi build`) to register the UID, commit the regenerated `types/generated/*.d.ts`, then use `as const` (never `as any`).
- **DoD per backend task:** `strapi ts:generate-types` (when a new content-type) → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`, all green. Commit on the current branch; never branch.
- Tests assert observable HTTP behavior + decoded domain content; no assert-nothing tests; no weakened rules.

---

### Task 1: `finance.money` component + shared `coerceNumeric` + `finance-money` util

**Files:**
- Create: `apps/strapi-oyl/src/components/finance/money.json`
- Create: `apps/strapi-oyl/src/utils/coerce.ts` (shared `coerceNumeric`)
- Modify: `apps/strapi-oyl/src/utils/nutrition-facts.ts` (import the shared `coerceNumeric`; drop the local copy)
- Create: `apps/strapi-oyl/src/utils/finance-money.ts`
- Test: `apps/strapi-oyl/test/finance-money-util.test.ts`

**Interfaces — Produces:**
- Component `finance.money` (`collectionName: "components_finance_money"`): `minor`(biginteger), `currency`(string), `exponent`(integer).
- `coerce.ts`: `export function coerceNumeric(v: unknown): unknown` — number→as-is (incl 0); finite-numeric-string→Number; else passthrough.
- `finance-money.ts`: `export const AMOUNT_POPULATE = { amount: true } as const`, `export const LIMIT_POPULATE = { limit: true } as const`; `export function sanitizeMoney(row: Record<string,unknown>, field: string): Record<string,unknown>` — if `row[field]` is a non-null object, return `{ ...row, [field]: { ...money, minor: coerceNumeric(money.minor) } }`; if `row[field]` is null/absent, return `row` unchanged.

- [ ] **Step 1: Failing test** — `finance-money-util.test.ts`: `coerceNumeric('150')===150`, `coerceNumeric(0)===0`, `coerceNumeric('abc')==='abc'`; `sanitizeMoney({amount:{minor:'1500',currency:'USD',exponent:2}},'amount').amount` → `{minor:1500 (number),currency:'USD',exponent:2}`; `sanitizeMoney({amount:{minor:'-1500',...}},'amount').amount.minor===-1500`; `sanitizeMoney({limit:null},'limit')` returns row unchanged; a non-money field is untouched.
- [ ] **Step 2: Run, verify fail** — `pnpm --filter @oyl/strapi-oyl-app exec vitest run test/finance-money-util.test.ts`.
- [ ] **Step 3: Implement** — write `money.json` (component); extract `coerceNumeric` to `coerce.ts`; update `nutrition-facts.ts` to import it (remove the duplicate, keep behavior identical); write `finance-money.ts`.
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/strapi-oyl-app exec strapi build && pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit && pnpm --filter @oyl/strapi-oyl-app test` (the util test + all existing 100 tests incl. nutrition-facts util stay green).
- [ ] **Step 5: Commit** — `feat(strapi-oyl): finance.money component + finance-money util (shared coerceNumeric)`.

---

### Task 2: `account` content-type (owner-scoped, no component)

**Files:**
- Create: `apps/strapi-oyl/src/api/account/content-types/account/schema.json`, `controllers/account.ts`, `routes/account.ts`
- Modify: `apps/strapi-oyl/src/index.ts` (grant), `apps/strapi-oyl/test/parity.test.ts`
- Modify: `apps/strapi-oyl/types/generated/*.d.ts` (via `ts:generate-types`)
- Test: `apps/strapi-oyl/test/account.owner-scoping.test.ts`

**Interfaces — Produces:** `account` content-type. Consumes: the owner-scoped `note` controller pattern (`apps/strapi-oyl/src/api/note/controllers/note.ts`) — clone it verbatim, swapping fields to `name`,`currency`. Domain: `Account.fromJSON` reads `{id,name,currency}` (`packages/all-of-oyl/src/finance/account.ts`).

- [ ] **Step 1: Failing test** — `account.owner-scoping.test.ts` (model on `note.owner-scoping.test.ts`): unauthenticated→401/403; A PUTs `/accounts/<recordId>` `{name:'Checking',currency:'USD'}` → A sees it, B's list excludes it; B's PUT/DELETE to that recordId→404; a 2nd PUT by A upserts (one row); decode `Account.fromJSON(strapiRowToShape(row))` (import from `@oyl/all-of-oyl`) → `name`/`currency` survive. Parity: `kindOf('accounts')==='personal'`; schema has `recordId`(req+unique), `name`, `currency`, `owner` manyToOne→users, NO creator/visibility.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** — schema (`info.singularName:"account"`, `pluralName:"accounts"`, `collectionName:"accounts"`, `draftAndPublish:false`); controller = `note`'s owner-scoped `db.query` controller with fields `name`,`currency` (UID `'api::account.account' as const`); routes `createCoreRouter('api::account.account')`; `ACCOUNT_ACTIONS` granted to `authenticated` in `index.ts`; parity assertions. Run `strapi ts:generate-types`, commit regenerated types.
- [ ] **Step 4: Run, verify pass** — `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): owner-scoped account content-type`.

---

### Task 3: `transaction` content-type (owner-scoped Entry + Money component)

**Files:**
- Create: `apps/strapi-oyl/src/api/transaction/content-types/transaction/schema.json`, `controllers/transaction.ts`, `routes/transaction.ts`
- Modify: `apps/strapi-oyl/src/index.ts` (grant), `apps/strapi-oyl/test/parity.test.ts`, `types/generated/*.d.ts`
- Test: `apps/strapi-oyl/test/transaction.owner-scoping.test.ts`

**Interfaces — Produces:** owner-scoped `transaction` content-type (completes the stubbed `transactions` per-kind repo). Consumes: `consumption` controller (`api/consumption` — owner gate + `documents()`/component handling), `finance-money` util (`AMOUNT_POPULATE`, `sanitizeMoney`). Domain: `Transaction.toJSON`/`fromJSON` (`packages/all-of-oyl/src/finance/transaction.ts`): base(`id`→recordId, `occurredAt`, `note`) + `amount`(Money `{minor,currency,exponent}`) + `category`(slug) + `direction`(`expense`|`income`) + `accountId?`(string).

- [ ] **Step 1: Failing test** — `transaction.owner-scoping.test.ts` (model on `consumption.owner-scoping.test.ts`): owner-isolation (A sees / B doesn't; B PUT/DELETE→404; 401 unauth); A PUTs a transaction `{occurredAt, amount:{minor:1500,currency:'USD',exponent:2}, category:'groceries', direction:'expense', accountId:<uuid>}` → upsert (one row); decode `Transaction.fromJSON(strapiRowToShape(row,{kind:'transaction'}))` → `amount` (a `Money` with numeric `minor`), `category`, `direction`, `accountId` survive; a **negative-amount refund** (`minor:-1500`, `direction:'expense'`) round-trips with `minor===-1500`. Parity: `kindOf('transactions')==='personal'`; schema has `recordId`(req+unique), `occurredAt`, `amount`→component `finance.money`, `category`, `direction` enum, `accountId`(string), `owner`, NO creator/visibility, no `kind` column.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** — schema (`amount`: `{type:component, repeatable:false, component:"finance.money"}`; `direction`: `{type:enumeration, enum:["expense","income"]}`; `category`/`accountId`: string; `occurredAt`: datetime required; no positivity constraint). Controller = `consumption`'s owner-scoped `documents()` controller, with `AMOUNT_POPULATE` + `sanitizeMoney(row,'amount')` on every read path (find/findOne/create/update returns), storing `amount` verbatim; `direction` client-supplied. UID `as const`. routes + `TRANSACTION_ACTIONS` grant + parity. `ROW_KIND_BY_COLLECTION.transactions='transaction'` is already wired. Run `strapi ts:generate-types`, commit regenerated types.
- [ ] **Step 4: Run, verify pass** — `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): owner-scoped transaction content-type (money component, upsert by recordId)`.

---

### Task 4: `budget` content-type (owner-scoped standalone + Money component)

**Files:**
- Create: `apps/strapi-oyl/src/api/budget/content-types/budget/schema.json`, `controllers/budget.ts`, `routes/budget.ts`
- Modify: `apps/strapi-oyl/src/index.ts` (grant), `apps/strapi-oyl/test/parity.test.ts`, `types/generated/*.d.ts`
- Test: `apps/strapi-oyl/test/budget.owner-scoping.test.ts`

**Interfaces — Produces:** owner-scoped `budget` content-type. Consumes: the `transaction` controller shape (owner gate + `documents()`/component), `finance-money` util (`LIMIT_POPULATE`, `sanitizeMoney`). Domain: `Budget.toJSON`/`fromJSON` (`packages/all-of-oyl/src/goal/budget.ts`): `{id, name?, category(slug), limit(Money)}` — NOT an Entry (no `kind`/`occurredAt`).

- [ ] **Step 1: Failing test** — `budget.owner-scoping.test.ts`: owner-isolation (A sees / B doesn't; B PUT/DELETE→404; 401); A PUTs `{name?:'Food money', category:'groceries', limit:{minor:100000,currency:'USD',exponent:2}}` → upsert (one row); decode `Budget.fromJSON(strapiRowToShape(row))` (NO kind — Budget isn't an Entry) → `category`,`limit`(numeric `minor`),`name?` survive. Parity: `kindOf('budgets')==='personal'`; schema has `recordId`(req+unique), `name`, `category`, `limit`→component `finance.money`, `owner`, NO creator/visibility, no `kind`/`occurredAt`.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** — schema (`limit`: component `finance.money`; `name`: string optional; `category`: string; no `owner+category` unique constraint). Controller = owner-scoped `documents()` controller with `LIMIT_POPULATE` + `sanitizeMoney(row,'limit')` on every read path; standalone (no kind/occurredAt). UID `as const`. routes + `BUDGET_ACTIONS` grant + parity. Run `strapi ts:generate-types`, commit regenerated types.
- [ ] **Step 4: Run, verify pass** — `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): owner-scoped budget content-type (money component)`.

---

### Task 5: App wiring (`BACKED`) + bootstrap decode test + finance test-strengthening

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/bootstrap.js` (`BACKED`)
- Modify/Test: `apps/vanilla-oyl/src/storage/bootstrap.test.js`; `apps/vanilla-oyl/src/components/oyl-finance-composer.test.js` (or the finance store/journal tests)

**Interfaces — Consumes:** `repos.accounts`/`repos.transactions`/`repos.budgets` (now real BACKED server repos), the existing `accounts-store`/`budgets-store`, and the journal-store's `transaction`-kind routing.

- [ ] **Step 1: Failing test** —
  - `bootstrap.test.js`: a kind-less Strapi transaction row with a `biginteger`-**string** `amount.minor` (e.g. `{ id:7, recordId:<uuid>, occurredAt:'…', category:'groceries', direction:'expense', amount:{ minor:'1500', currency:'USD', exponent:2 } }`) → `repos.transactions.list()` returns one `Transaction` whose `amount.minor === 1500` (number) and `id === recordId` — proving `ROW_KIND` injection + `sanitizeMoney` coercion through the real BACKED repo. Also assert `repos.accounts`/`repos.budgets` are real server repos (a `save` enqueues to the outbox), no longer stubs.
  - finance composer/store test (fakes): logging a `Transaction` enqueues to `reposByKind['transaction']` specifically (other kind repos stay empty); `transactionsIn`/budget aggregation reflect it; a negative-amount refund round-trips.
- [ ] **Step 2: Run, verify fail** — `pnpm vanilla test bootstrap` (the decode/real-repo assertions fail while `accounts`/`transactions`/`budgets` are stubbed).
- [ ] **Step 3: Implement** — `bootstrap.js`: `BACKED = new Set([... 'notes','consumptions','accounts','transactions','budgets'])`. No other bootstrap change (PATH + ROW_KIND already present). Add/adjust the tests above. (NOTE: the bootstrap decode test needs the Strapi backend NOT running — it uses a fake `api.find` returning the row, exactly like B1's consumption decode test.)
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test`.
- [ ] **Step 5: Commit** — `feat(vanilla-oyl): back accounts/transactions/budgets repos (per-kind finance wiring)`.

---

## Manual acceptance (after Task 5)

Backend + app (fresh DB), signed in: create an `Account`; log a `Transaction` against it (incl. a refund = negative expense) → flushes to `/api/transactions`, persists owner-isolated, reads back with exact `Money`; create a `Budget` for a category → it aggregates the month's transactions. Confirm a second user sees none of the first user's finance records (owner isolation).

## Self-review (coverage map)

- Spec F.1 (money component + util) → T1. F.2 (account) → T2. F.3 (transaction) → T3. F.4 (budget) → T4. F.5 (wiring + e2e/tests) → T5.
- Reuse: `note` controller = account/transaction/budget owner-scoped template; `consumption` controller = the component-bearing (`documents()`) template; `nutrition-facts.ts` util shape → `finance-money.ts`; `strapiRowToShape` + `ROW_KIND` (transactions already mapped); parity + booted-test harness; `ts:generate-types`→`as const`.
- Type consistency: `sanitizeMoney(row, field)` signature used identically in T3 (`'amount'`) and T4 (`'limit'`); `coerceNumeric` shared via `coerce.ts` (T1) and re-used by the existing nutrition util.
- Deferred (per spec): `Category` relational catalog; finance reporting UI; multi-currency; opening balances; `measurements`/`activitySessions` backends (future sub-projects).
