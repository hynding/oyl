# Backend SP2.2b — batch endpoint + full protocol conformance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). **Booted-Strapi slice:** run `strapi build` before any test run that exercises `src/` changes. The conformance test boots the real app and runs the SP1 `httpProtocolContract`. Two watch-points (handle only if they bite): R-H cross-package TS resolution, R-G same-millisecond `updatedAt`/`createdAt`.

**Goal:** Add the batch endpoint and certify `apps/strapi-oyl` against the SP1 conformance suite — all 12 `repositoryContract` cases green against the real booted Strapi. Completes SP2.

**Architecture:** A `POST /v1/:collection` batch handler (strip the `:batch` suffix) with **validate-all-then-apply** atomicity (no `strapi.db.transaction`); the `authenticated` role gains the `batch` action; `@oyl/all-of-oyl` exposes its conformance harness via a `./testing` source subpath; a conformance test boots + authenticates + runs the contract.

**Spec:** `docs/superpowers/specs/2026-06-15-strapi-oyl-record-conformance-design.md`. **Protocol:** `docs/oyl-sync-protocol-v1.md`.

**Branch:** `feat/strapi-oyl-conformance` (off `master` HEAD). Baseline: `pnpm --filter @oyl/strapi-oyl-app exec vitest run` green (8 tests).

---

### Task 1: Batch endpoint + conformance (single TDD slice)

**Files:** `packages/all-of-oyl/package.json` (export); `apps/strapi-oyl/{package.json, src/api/oyl-record/routes/v1.ts, src/api/oyl-record/controllers/oyl-record.ts, src/index.ts, test/conformance.test.ts}`.

- [ ] **Step 1: Expose the harness + add the devDep**

In `packages/all-of-oyl/package.json`, add to `exports` (after the `"."` entry):
```jsonc
"./testing": "./src/core/http-repository-contract.ts",
```
In `apps/strapi-oyl/package.json`, add to `devDependencies`:
```jsonc
"@oyl/all-of-oyl": "workspace:*"
```
Run `pnpm install` (from repo root). Expected: resolves; `@oyl/all-of-oyl` linked into `apps/strapi-oyl`.

- [ ] **Step 2: Write the conformance test**

Create `apps/strapi-oyl/test/conformance.test.ts`:
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
  baseUrl,
  fetch: globalThis.fetch,
  getToken: async () => jwt,
}))
```
**R-H:** if `@oyl/all-of-oyl/testing` won't resolve in `apps/strapi-oyl`'s vitest (it's TS source with NodeNext `.js`→`.ts` imports), mirror `apps/vanilla-oyl`'s vitest/vite config — vanilla-oyl already consumes `@oyl/all-of-oyl` source in its tests. Copy whatever resolution setup it uses (conditions/alias); do not invent one.

- [ ] **Step 3: Build + run — verify RED**

Run: `pnpm --filter @oyl/strapi-oyl-app exec strapi build && pnpm --filter @oyl/strapi-oyl-app exec vitest run test/conformance.test.ts`
Expected: the **`saveMany` cases FAIL** (no batch endpoint → 404/405, or 403 if the route exists without the grant). The single-record cases (get/list/save/delete/purge/foreign-meta-create) should already PASS from SP2.2a. If a single-record case fails, note it — Step 6 fixes the controller (R-C). If the harness import itself fails to resolve, fix per R-H first. If `updatedAt > createdAt` flakes, see R-G (Step 6).

- [ ] **Step 4: Add the batch route**

In `apps/strapi-oyl/src/api/oyl-record/routes/v1.ts`, add to the `routes` array (a 5th route):
```ts
    { method: 'POST', path: '/v1/:collection', handler: 'oyl-record.batch' },
```

- [ ] **Step 5: Add the `batch` handler to the controller**

In `apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts`, add this method to the returned object (after `remove`, with a trailing comma — reuses `query`/`findRow`/`decideUpsert`/`toEnvelope`):
```ts
    async batch(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const collection = String(ctx.params.collection).replace(/:batch$/, '')
      const items = (ctx.request.body?.items ?? []) as Array<{ id: string; data: unknown; revision: number | null }>
      if (items.length === 0) { ctx.body = { records: [] }; return }

      // (1) decide all — any conflict aborts before any write (R-B atomicity)
      const plans: Array<{ item: { id: string; data: unknown }; existingId: number | null; revision: number }> = []
      for (const item of items) {
        const existing = await findRow(owner, collection, item.id)
        const decision = decideUpsert(existing ? { revision: existing.revision } : undefined, item.revision ?? null)
        if (decision.action === 'conflict') {
          ctx.status = 409
          ctx.body = { error: { code: 'REVISION_CONFLICT', message: `stale revision for ${collection}/${item.id}` } }
          return
        }
        plans.push({ item, existingId: existing ? existing.id : null, revision: decision.action === 'update' ? decision.revision : 1 })
      }

      // (2) apply all
      const records: ReturnType<typeof toEnvelope>[] = []
      for (const { item, existingId, revision } of plans) {
        const saved =
          existingId == null
            ? await query().create({ data: { owner: owner, collection, recordId: item.id, data: item.data as any, revision: 1, deletedAt: null } })
            : await query().update({ where: { id: existingId }, data: { data: item.data as any, revision, deletedAt: null } })
        records.push(toEnvelope(saved as unknown as RecordRow))
      }
      ctx.body = { records }
    },
```

- [ ] **Step 6: Grant the `batch` action (R-A)**

In `apps/strapi-oyl/src/index.ts`, change:
```ts
const V1_ACTIONS = ['list', 'findOne', 'upsert', 'remove'].map((a) => `api::oyl-record.oyl-record.${a}`)
```
to:
```ts
const V1_ACTIONS = ['list', 'findOne', 'upsert', 'remove', 'batch'].map((a) => `api::oyl-record.oyl-record.${a}`)
```

- [ ] **Step 7: Build + run — verify GREEN; iterate**

Run: `pnpm --filter @oyl/strapi-oyl-app exec strapi build && pnpm --filter @oyl/strapi-oyl-app exec vitest run`
Expected: **all tests green** — the full `repositoryContract` (12 cases, incl. `saveMany` mixed/empty/atomic) passes against the real Strapi, plus the SP2.2a smoke + pure-helper tests. Iterate (rebuild after each `src/` change):
- **R-C:** if a single-record contract case diverges (e.g. `createdAt` year, soft-delete idempotency, purge-then-recreate), fix the controller — keep `decideUpsert`/`toEnvelope` intact.
- **R-G:** if `updatedAt > createdAt` flakes (create+save same millisecond), fix server-side so `updatedAt` strictly advances on update (do **not** loosen the contract).
- If the batch still 403s with a valid JWT, the grant didn't apply — confirm `'batch'` is in `V1_ACTIONS` and the bootstrap re-ran (fresh per-boot DB rebuilds permissions).
- If genuinely stuck, STOP and report.

- [ ] **Step 8: Typecheck** — `pnpm --filter @oyl/strapi-oyl-app typecheck` → clean. Also `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` (the new export shouldn't affect it) → clean.

- [ ] **Step 9: Commit**
```bash
git add packages/all-of-oyl/package.json apps/strapi-oyl pnpm-lock.yaml
git commit -m "feat(strapi-oyl-app): batch endpoint + full httpProtocolContract conformance (SP2 complete)"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/strapi-oyl-app exec strapi build` + `typecheck` clean.
- [ ] `pnpm --filter @oyl/strapi-oyl-app exec vitest run` — pure helpers + SP2.2a smoke + **`conformance.test.ts` (all 12 contract cases against the booted Strapi)** green.
- [ ] The Strapi server runtime still imports nothing from `@oyl/all-of-oyl` (test-only devDep) or `packages/strapi-oyl`. **SP2 is complete:** a backend-agnostic protocol (SP1) with a conformant Strapi reference backend (SP2), both proven by one shared executable spec. Next: SP3 (client auth) → SP4 (wire vanilla-oyl + compose) → SP5 (offline sync).
