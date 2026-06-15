# Backend SP2.2b — batch endpoint + full protocol conformance — Design

**Status:** approved (forks confirmed; R-A batch grant, R-B validate-first atomicity, R-C–R-F)
**Date:** 2026-06-15
**Packages:** `apps/strapi-oyl` (`@oyl/strapi-oyl-app`) + a one-line export in `@oyl/all-of-oyl`
**Context:** Final slice of SP2. SP2.1 built the single-record `/v1` endpoints; SP2.2a added auth + owner-scoping. **SP2.2b adds the batch endpoint and certifies the real Strapi against the SP1 conformance suite** — the same `httpProtocolContract` that validated the in-memory fake now runs against the booted backend. After this, SP2 is complete (a conformant reference backend).

---

## What this is

Three things: (1) the batch endpoint (`POST /v1/:collection:batch`) with **validate-all-then-apply** atomicity; (2) expose the SP1 conformance harness via a `@oyl/all-of-oyl/testing` subpath; (3) a conformance test that boots the app, authenticates, and runs **all 12 `repositoryContract` cases** against it — green = the backend conforms to the OYL sync protocol.

### Decisions (settled)

1. **Batch atomicity = validate-all-then-apply (R-B), no transaction required.** Compute `decideUpsert` for every item first; if **any** is `conflict` → `409 REVISION_CONFLICT` and write nothing; else apply all. This satisfies the contract's *"a stale item rejects and persists none"* without depending on Strapi 5.47's (precedent-free) `strapi.db.transaction` API. A real transaction is **optional hardening** (covers mid-write DB-error atomicity, which the contract doesn't test).
2. **The batch route needs its own permission grant (R-A).** Add `batch` to the bootstrap's `V1_ACTIONS` (`api::oyl-record.oyl-record.batch`) — otherwise an authenticated request 403s.
3. **Batch route `POST /v1/:collection`, strip the `:batch` suffix.** koa captures `lifeAreas:batch` as the `:collection` param (one segment); the handler strips `:batch`. Keeps the protocol path the SP1 adapter already sends (`${base}:batch`); no other POST exists on `/v1`.
4. **Conformance harness exposed via `@oyl/all-of-oyl/testing` (R-D, source-only).** Add `"./testing": "./src/core/http-repository-contract.ts"` to the package `exports`; `apps/strapi-oyl` adds `@oyl/all-of-oyl` as a **test-only devDep** (R-E) — the server runtime imports nothing from it, preserving the generic-store independence. No dist/build or react/next impact (it's the already-dist-excluded `*-contract.ts`).
5. **Conformance reset via top-level `beforeEach` truncate** (applies to the harness's nested `it`s); boot + register once in `beforeAll`.

### Out of scope

- Real `strapi.db.transaction` (optional hardening, not needed for conformance). SP3 (client login/token), SP4 (wire vanilla-oyl + docker-compose), SP5 (offline sync). Pagination / data-size cap (protocol R15/R16, future).

---

## What the contract requires of the batch (from `repository-contract.ts`)

- `saveMany` stamps fresh meta on all items and persists them;
- `saveMany([])` → `[]` (no-op);
- mixed create + update in one batch;
- **atomic: a stale item rejects with `REVISION_CONFLICT` and persists none of the batch.**

---

## Architecture

### 1. `apps/strapi-oyl/src/api/oyl-record/routes/v1.ts` — add the batch route
```ts
{ method: 'POST', path: '/v1/:collection', handler: 'oyl-record.batch' },
```
(added to the existing 4 routes; auth required like the rest)

### 2. `apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts` — `batch` handler
Reuses `findRow`/`query()`/`decideUpsert`/`toEnvelope` from SP2.2a:
```ts
async batch(ctx: any) {
  const owner = ctx.state.user?.id
  if (owner == null) return ctx.unauthorized()
  const collection = String(ctx.params.collection).replace(/:batch$/, '')
  const items = (ctx.request.body?.items ?? []) as Array<{ id: string; data: unknown; revision: number | null }>
  if (items.length === 0) { ctx.body = { records: [] }; return }

  // (1) decide all — any conflict aborts before any write (R-B)
  const plans: Array<{ item: typeof items[number]; existing: Row | null; revision: number; create: boolean }> = []
  for (const item of items) {
    const existing = await findRow(owner, collection, item.id)
    const decision = decideUpsert(existing ? { revision: existing.revision } : undefined, item.revision ?? null)
    if (decision.action === 'conflict') {
      ctx.status = 409
      ctx.body = { error: { code: 'REVISION_CONFLICT', message: `stale revision for ${collection}/${item.id}` } }
      return
    }
    plans.push({ item, existing, revision: decision.action === 'update' ? decision.revision : 1, create: decision.action === 'create' })
  }

  // (2) apply all
  const records = []
  for (const { item, existing, revision, create } of plans) {
    const saved = create
      ? await query().create({ data: { owner, collection, recordId: item.id, data: item.data as any, revision: 1, deletedAt: null } })
      : await query().update({ where: { id: existing!.id }, data: { data: item.data as any, revision, deletedAt: null } })
    records.push(toEnvelope(saved as unknown as RecordRow))
  }
  ctx.body = { records }
}
```

### 3. `apps/strapi-oyl/src/index.ts` — grant the batch action (R-A)
```ts
const V1_ACTIONS = ['list', 'findOne', 'upsert', 'remove', 'batch'].map((a) => `api::oyl-record.oyl-record.${a}`)
```

### 4. `packages/all-of-oyl/package.json` — expose the harness (R-D)
Add to `exports`:
```jsonc
"./testing": "./src/core/http-repository-contract.ts",
```

### 5. `apps/strapi-oyl/package.json` — test-only devDep (R-E)
Add `"@oyl/all-of-oyl": "workspace:*"` to `devDependencies`. Run `pnpm install`.

### 6. `apps/strapi-oyl/test/conformance.test.ts` — the acceptance
```ts
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { httpProtocolContract } from '@oyl/all-of-oyl/testing'
import { boot, truncateRecords } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwt: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt } = await registerUser(baseUrl, `conf-${Date.now()}`))
})
afterAll(async () => { await stop?.() })
beforeEach(async () => { await truncateRecords() })

httpProtocolContract('apps/strapi-oyl (booted)', () => ({
  baseUrl,                       // ends in /api (R-F)
  fetch: globalThis.fetch,
  getToken: async () => jwt,
}))
```
The `makeDeps` closure reads the `baseUrl`/`jwt` bindings set by `beforeAll`; `httpProtocolContract` registers the contract `it`s, which the file's `beforeEach` truncate resets.

**R-H (verify cross-package TS resolution):** `@oyl/all-of-oyl/testing` resolves to TS source whose imports use NodeNext `.js` extensions (`./repository-contract.js`→`.ts`, `../collections.js`→`.ts`). `apps/strapi-oyl` is a CommonJS app, so its vitest must resolve that `.js`→`.ts` chain across the package boundary. **`vanilla-oyl` already consumes `@oyl/all-of-oyl` source in its vitest — mirror its vitest/vite resolution config** (conditions/alias); if the subpath won't resolve, copy vanilla-oyl's setup rather than inventing one.

**R-G (watch-point — same-millisecond timestamp flake):** the contract's *"bumps revision and updatedAt"* case asserts `updatedAt > createdAt`. The fake guarantees this with a monotonic clock; the real Strapi uses wall-clock timestamps, so a create + follow-up save in the same millisecond would make them equal and fail. Each contract step is a separate awaited HTTP round-trip (≫1ms), so it should hold — but if it flakes here, fix it **server-side** (ensure `updatedAt` strictly advances on update), not by loosening the contract.

---

## TDD shape (one slice — conformance needs batch)

1. Add the `./testing` export + the `@oyl/all-of-oyl` devDep; `pnpm install`.
2. Write `conformance.test.ts`; `strapi build` + run → **RED on the `saveMany` cases** (no batch endpoint → 404/405/403). The single-record cases should already pass (SP2.2a). (R-C: if a single-record case also fails, fix the controller — keep `decideUpsert`/`toEnvelope` intact.)
3. Add the batch route + `batch` handler + the bootstrap `batch` grant; `strapi build` + run → **GREEN (all 12 cases)**.

## Testing

- **`conformance.test.ts`** — the full `repositoryContract` (12 cases) against the booted, authenticated Strapi. This is the SP2 acceptance.
- The SP2.2a smoke test and the pure-helper tests remain green.
- (Optional) a focused batch smoke (atomic-rollback) for faster debugging — but the contract's atomic `saveMany` case already covers it.

## File structure
```
apps/strapi-oyl/
  src/api/oyl-record/routes/v1.ts        (modify: + POST batch route)
  src/api/oyl-record/controllers/oyl-record.ts (modify: + batch handler)
  src/index.ts                            (modify: + 'batch' in V1_ACTIONS)
  package.json                            (modify: + @oyl/all-of-oyl devDep)
  test/conformance.test.ts                (new)
packages/all-of-oyl/package.json          (modify: + "./testing" export)
```
`decideUpsert`/`toEnvelope`, the boot harness, and `registerUser` are unchanged. The Strapi server runtime still imports nothing from `@oyl/all-of-oyl` or `packages/strapi-oyl`.

## Acceptance

`pnpm --filter @oyl/strapi-oyl-app exec strapi build` + `typecheck` clean; `pnpm --filter @oyl/strapi-oyl-app exec vitest run` green — including **`conformance.test.ts`: all 12 `repositoryContract` cases pass against the real booted Strapi** (the same suite that certifies the in-memory fake). SP2 is complete: a backend-agnostic protocol (SP1) with a conformant Strapi reference implementation (SP2) — both proven by one shared executable spec. Remaining arc: SP3 (client auth) → SP4 (wire vanilla-oyl + compose) → SP5 (offline sync).
