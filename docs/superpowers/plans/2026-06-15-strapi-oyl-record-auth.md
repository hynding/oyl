# Backend SP2.2a — authentication + owner-scoping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). **Note:** this is a booted-Strapi slice — the smoke test boots the app from `dist/`, so **run `strapi build` before each test run**. Iterate against the running app; if query-engine/relation specifics differ in 5.47, adjust mechanics but keep `decideUpsert`/`toEnvelope` and the owner-scoping intact.

**Goal:** Make `apps/strapi-oyl`'s `/v1` endpoints require a JWT and scope every record to its owner — closing the CRITICAL unauthenticated-mutation finding — verified by an authed smoke round-trip + a cross-tenant isolation test.

**Architecture:** Drop `auth:false`; controller moves from the document service to the **query engine** (`strapi.db.query`) so `owner` is set server-side without `throwRestrictedRelations` (no `user.find` grant → no user enumeration). A bootstrap grants the `authenticated` role exactly the 4 `/v1` actions. The boot harness uses a fresh per-boot SQLite DB so user registration is idempotent across runs.

**Spec:** `docs/superpowers/specs/2026-06-15-strapi-oyl-record-auth-design.md`

**Branch:** `feat/strapi-oyl-record-auth` (off `master` HEAD). Baseline: `pnpm --filter @oyl/strapi-oyl-app exec strapi build` + `vitest run` green (6 tests).

---

### Task 1: Auth + owner-scoping (single cohesive slice, TDD)

**Files:** Modify `routes/v1.ts`, `controllers/oyl-record.ts`, `src/index.ts`, `test/boot.ts`; create `test/helpers.ts`; rewrite `test/oyl-record.smoke.test.ts`. All under `apps/strapi-oyl/`.

- [ ] **Step 1: Fresh per-boot DB + the registerUser helper**

In `apps/strapi-oyl/test/boot.ts`, change the test DB to a unique file per boot (so registering users never collides across runs/files). Replace the line `process.env['DATABASE_FILENAME'] = '.tmp/test.db'` with:
```ts
  process.env['DATABASE_FILENAME'] = `.tmp/test-${process.pid}-${Date.now()}.db`
```

Create `apps/strapi-oyl/test/helpers.ts`:
```ts
/** Register a users-permissions user and return its JWT + id (public role has register by default). */
export async function registerUser(baseUrl: string, username: string): Promise<{ jwt: string; userId: number }> {
  const res = await fetch(`${baseUrl}/auth/local/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@test.dev`, password: 'Password123!' }),
  })
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { jwt: string; user: { id: number } }
  return { jwt: body.jwt, userId: body.user.id }
}
```

- [ ] **Step 2: Rewrite the smoke test (auth round-trip + no-token + isolation)**

Replace `apps/strapi-oyl/test/oyl-record.smoke.test.ts` with:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { boot, truncateRecords } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, 'userA'))
})
afterAll(async () => { await stop?.() })
beforeEach(async () => { await truncateRecords() })

const uid = '11111111-1111-4111-8111-111111111111'
const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })
const put = (jwt: string, rev: number | null, recordId = uid, name = 'Health') =>
  fetch(`${baseUrl}/v1/lifeAreas/${recordId}`, { method: 'PUT', headers: h(jwt), body: JSON.stringify({ data: { id: recordId, name, slug: 'health' }, revision: rev }) })
const listFor = async (jwt: string, qs = '') => (await (await fetch(`${baseUrl}/v1/lifeAreas${qs}`, { headers: h(jwt) })).json()).records

describe('oyl-record /v1 — auth + isolation (booted)', () => {
  it('requires a token (no Authorization → 401/403)', async () => {
    const res = await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { method: 'PUT', headers: h(), body: JSON.stringify({ data: {}, revision: null }) })
    expect([401, 403]).toContain(res.status)
    expect(await listFor(jwtA)).toHaveLength(0) // nothing was written
  })

  it('authed create → conflict → bump → list → soft delete → purge', async () => {
    const c = await put(jwtA, null); expect(c.status).toBe(200); expect((await c.json()).revision).toBe(1)
    expect((await put(jwtA, null)).status).toBe(409)
    const u = await put(jwtA, 1); expect(u.status).toBe(200); expect((await u.json()).revision).toBe(2)
    expect(await listFor(jwtA)).toHaveLength(1)
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { method: 'DELETE', headers: h(jwtA) })).status).toBe(204)
    expect(await listFor(jwtA)).toHaveLength(0)
    expect(await listFor(jwtA, '?includeDeleted=1')).toHaveLength(1)
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}?purge=1`, { method: 'DELETE', headers: h(jwtA) })).status).toBe(204)
    expect(await listFor(jwtA, '?includeDeleted=1')).toHaveLength(0)
  })

  it('isolates tenants: A cannot see or mutate B records', async () => {
    const { jwt: jwtB } = await registerUser(baseUrl, `userB-${Date.now()}`)
    const bX = await put(jwtB, null); expect((await bX.json()).revision).toBe(1)         // B owns X@rev1
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { headers: h(jwtA) })).status).toBe(404) // A can't see it
    expect(await listFor(jwtA)).toHaveLength(0)
    const aX = await put(jwtA, null); expect(aX.status).toBe(200); expect((await aX.json()).revision).toBe(1) // A creates its OWN X (no conflict)
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}?purge=1`, { method: 'DELETE', headers: h(jwtA) })).status).toBe(204) // A purges its own
    const bGet = await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { headers: h(jwtB) })       // B's X untouched
    expect(bGet.status).toBe(200); expect((await bGet.json()).revision).toBe(1)
  })
})
```
(`registerUser('userA')` in `beforeAll` is safe because Step 1 makes the DB fresh per boot; the isolation test's `userB-${Date.now()}` is extra insurance.)

- [ ] **Step 3: Build + run — verify RED**

Run: `pnpm --filter @oyl/strapi-oyl-app exec strapi build && pnpm --filter @oyl/strapi-oyl-app exec vitest run test/oyl-record.smoke.test.ts`
Expected: against the current `auth:false` + stub-owner controller, the **no-token test fails** (route is public → 200, not 401/403) and the **isolation test fails** (stub owner = null → A and B share one namespace, so A sees B's X). The authed round-trip may pass (auth:false ignores the token). If nothing is red, STOP and report (the tests aren't exercising the gap).

- [ ] **Step 4: Implement — routes require auth**

`apps/strapi-oyl/src/api/oyl-record/routes/v1.ts`:
```ts
export default {
  routes: [
    { method: 'GET',    path: '/v1/:collection',     handler: 'oyl-record.list' },
    { method: 'GET',    path: '/v1/:collection/:id',  handler: 'oyl-record.findOne' },
    { method: 'PUT',    path: '/v1/:collection/:id',  handler: 'oyl-record.upsert' },
    { method: 'DELETE', path: '/v1/:collection/:id',  handler: 'oyl-record.remove' },
  ],
}
```

- [ ] **Step 5: Implement — controller (query engine + owner-scoping)**

Replace `apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts`:
```ts
import { factories } from '@strapi/strapi'
import { decideUpsert, toEnvelope, type RecordRow } from '../services/upsert-rule'

const UID = 'api::oyl-record.oyl-record' as const
type Row = RecordRow & { id: number }

export default factories.createCoreController(UID, ({ strapi }) => {
  const query = () => strapi.db.query(UID)
  const findRow = (owner: number, collection: string, recordId: string) =>
    query().findOne({ where: { owner, collection, recordId } }) as Promise<Row | null>

  return {
    async list(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection } = ctx.params
      const where: Record<string, unknown> = { owner, collection }
      if (ctx.query.includeDeleted !== '1') where.deletedAt = null
      const rows = (await query().findMany({ where })) as unknown as RecordRow[]
      ctx.body = { records: rows.map(toEnvelope) }
    },

    async findOne(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection, id } = ctx.params
      const row = await findRow(owner, collection, id)
      if (!row || row.deletedAt) return ctx.notFound()
      ctx.body = toEnvelope(row)
    },

    async upsert(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection, id } = ctx.params
      const { data, revision } = (ctx.request.body ?? {}) as { data?: unknown; revision?: number | null }
      const existing = await findRow(owner, collection, id)
      const decision = decideUpsert(existing ? { revision: existing.revision } : undefined, revision ?? null)
      if (decision.action === 'conflict') {
        ctx.status = 409
        ctx.body = { error: { code: 'REVISION_CONFLICT', message: `stale revision for ${collection}/${id}` } }
        return
      }
      const saved =
        decision.action === 'create'
          ? await query().create({ data: { owner, collection, recordId: id, data: data as any, revision: 1, deletedAt: null } })
          : await query().update({ where: { id: existing!.id }, data: { data: data as any, revision: decision.revision, deletedAt: null } })
      ctx.body = toEnvelope(saved as unknown as RecordRow)
    },

    async remove(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection, id } = ctx.params
      const existing = await findRow(owner, collection, id)
      if (!existing) { ctx.status = 204; return }
      if (ctx.query.purge === '1') {
        await query().delete({ where: { id: existing.id } })
      } else if (!existing.deletedAt) {
        await query().update({ where: { id: existing.id }, data: { deletedAt: new Date(), revision: existing.revision + 1 } })
      }
      ctx.status = 204
    },
  }
})
```
If the query engine's relation filter/write shape differs in 5.47 (e.g. `where: { owner: { id: owner } }` or `data: { owner: { connect: [owner] } }`), adjust to whatever the booted app accepts — keep owner-scoping on every read and the owner set on create. Confirm `toEnvelope` gets `createdAt`/`updatedAt` from the row (query engine returns them by default).

- [ ] **Step 6: Implement — bootstrap permission grant**

Replace `apps/strapi-oyl/src/index.ts`:
```ts
import type { Core } from '@strapi/strapi'

const V1_ACTIONS = ['list', 'findOne', 'upsert', 'remove'].map((a) => `api::oyl-record.oyl-record.${a}`)

async function grantAuthenticated(strapi: Core.Strapi) {
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } })) as { id: number } | null
  if (!role) { strapi.log.warn('[oyl] authenticated role not found; skipping /v1 permission grant'); return }
  for (const action of V1_ACTIONS) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({ where: { action, role: role.id } })
    if (!existing) await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } })
  }
}

export default {
  register(_ctx: { strapi: Core.Strapi }) {},
  async bootstrap({ strapi }: { strapi: Core.Strapi }) { await grantAuthenticated(strapi) },
}
```

- [ ] **Step 7: Build + run — verify GREEN; iterate**

Run: `pnpm --filter @oyl/strapi-oyl-app exec strapi build && pnpm --filter @oyl/strapi-oyl-app exec vitest run`
Expected: all tests green — the no-token request is denied (401/403), the authed round-trip behaves per the protocol, and tenant isolation holds (A can't see/mutate B's X; B's X survives A's operations). Iterate on the controller/query-engine specifics + the bootstrap grant until green. If a request unexpectedly 403s *with* a valid JWT, the bootstrap grant didn't apply — debug the action strings / role lookup. **If you can't get authed requests through after genuine effort, STOP and report** (likely a permission-grant or query-engine-relation detail).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @oyl/strapi-oyl-app typecheck` → clean.

- [ ] **Step 9: Commit**
```bash
git add apps/strapi-oyl/src apps/strapi-oyl/test
git commit -m "feat(strapi-oyl-app): require auth + owner-scope the /v1 record store (closes unauth-mutation gap)"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/strapi-oyl-app exec strapi build` + `typecheck` clean.
- [ ] `pnpm --filter @oyl/strapi-oyl-app exec vitest run` — pure-helper tests + the auth/isolation smoke test green.
- [ ] The CRITICAL unauthenticated-mutation finding is closed: `/v1` requires a JWT, records are owner-scoped, and cross-tenant isolation is proven. No `plugin::users-permissions.user.find` grant exists (no user enumeration). SP2.2b adds batch + the full `httpProtocolContract` conformance.
