# Backend SP2.1 — new Strapi app + generic record store + `/v1` single-record endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. **Note:** Tasks 2 & 4 are framework-exploratory (scaffolding + programmatically booting Strapi 5.47). Where exact Strapi APIs are uncertain, the plan gives a best-effort starting point and an explicit verification step — iterate against the running app rather than assuming.

**Goal:** A standalone Strapi 5 app at `apps/strapi-oyl` (`@oyl/strapi-oyl-app`) whose only model is a generic `oyl-record` content-type, exposing the OYL sync protocol v1 `/v1` single-record endpoints over a blob store with the revision/tombstone rule, verified by a booted smoke test. Stub owner; auth/batch/conformance = SP2.2.

**Architecture:** Pure decision logic (`decideUpsert`/`toEnvelope`, unit-tested, no Strapi) wrapped by a thin Strapi controller over `strapi.documents('api::oyl-record.oyl-record')`; custom `/v1` routes only (no core router); SQLite dev/test. A reusable programmatic boot harness backs the smoke test (and SP2.2's conformance).

**Tech Stack:** Strapi 5.47.1 (TS, CommonJS tsconfig), `@strapi/plugin-users-permissions`, better-sqlite3, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-strapi-oyl-record-store-design.md`. **Protocol:** `docs/oyl-sync-protocol-v1.md`.

**Branch:** `feat/strapi-oyl-record-store` (off `master` HEAD). Nothing imports from `packages/strapi-oyl` at runtime.

---

### Task 1: Package shell + pure helpers — `decideUpsert` + `toEnvelope`

**Files:** Create `apps/strapi-oyl/package.json` (+ root alias), then `apps/strapi-oyl/src/api/oyl-record/services/upsert-rule.ts` + `upsert-rule.test.ts`.

- [ ] **Step 0: Create the package shell so the workspace + vitest resolve**

Create `apps/strapi-oyl/package.json` (full content shown in Task 2 Step 1 — name `@oyl/strapi-oyl-app`, the Strapi deps, `vitest` devDep, scripts). Add to the repo-root `package.json` `scripts`: `"strapi-app": "pnpm --filter @oyl/strapi-oyl-app"`. Run `pnpm install`. (Task 2 reuses this `package.json`; it is created once here.)

- [ ] **Step 1: Write the failing tests**

`apps/strapi-oyl/src/api/oyl-record/services/upsert-rule.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { decideUpsert, toEnvelope } from './upsert-rule'

describe('decideUpsert', () => {
  it('creates when nothing is stored (ignoring any asserted revision)', () => {
    expect(decideUpsert(undefined, null)).toEqual({ action: 'create' })
    expect(decideUpsert(undefined, 99)).toEqual({ action: 'create' })
  })
  it('updates and bumps when the asserted revision matches', () => {
    expect(decideUpsert({ revision: 3 }, 3)).toEqual({ action: 'update', revision: 4 })
  })
  it('conflicts on a mismatched or meta-less assertion against an existing record', () => {
    expect(decideUpsert({ revision: 3 }, 2)).toEqual({ action: 'conflict' })
    expect(decideUpsert({ revision: 3 }, null)).toEqual({ action: 'conflict' })
  })
})

describe('toEnvelope', () => {
  it('maps a row to the protocol envelope, normalizing dates and null deletedAt', () => {
    const env = toEnvelope({ recordId: 'r1', data: { a: 1 }, revision: 2, createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-02T00:00:00Z'), deletedAt: null })
    expect(env).toEqual({ id: 'r1', data: { a: 1 }, revision: 2, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z', deletedAt: null })
  })
  it('serializes a present deletedAt', () => {
    const env = toEnvelope({ recordId: 'r1', data: {}, revision: 5, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z', deletedAt: new Date('2026-06-03T00:00:00Z') })
    expect(env.deletedAt).toBe('2026-06-03T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run; verify FAIL**

Run: `pnpm --filter @oyl/strapi-oyl-app exec vitest run src/api/oyl-record/services/upsert-rule.test.ts`
Expected: FAIL — `upsert-rule` module not found (the package + vitest resolve, since Step 0 created them).

- [ ] **Step 3: Implement**

`apps/strapi-oyl/src/api/oyl-record/services/upsert-rule.ts`:
```ts
export type StoredRev = { revision: number } | undefined
export type UpsertDecision = { action: 'create' } | { action: 'update'; revision: number } | { action: 'conflict' }

/** Mirror InMemoryRepository: no record → create (server stamps rev 1, asserted ignored); exists → require match else conflict; match → bump. */
export function decideUpsert(stored: StoredRev, asserted: number | null): UpsertDecision {
  if (!stored) return { action: 'create' }
  if (asserted !== stored.revision) return { action: 'conflict' }
  return { action: 'update', revision: stored.revision + 1 }
}

export interface RecordRow { recordId: string; data: unknown; revision: number; createdAt: string | Date; updatedAt: string | Date; deletedAt: string | Date | null }
export interface Envelope { id: string; data: unknown; revision: number; createdAt: string; updatedAt: string; deletedAt: string | null }

const iso = (d: string | Date): string => (d instanceof Date ? d.toISOString() : d)

/** Map a stored row to the protocol record envelope. */
export function toEnvelope(row: RecordRow): Envelope {
  return { id: row.recordId, data: row.data, revision: row.revision, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), deletedAt: row.deletedAt ? iso(row.deletedAt) : null }
}
```

- [ ] **Step 4: Run; verify PASS** — `pnpm --filter @oyl/strapi-oyl-app exec vitest run src/api/oyl-record/services/upsert-rule.test.ts` → 5 pass.

- [ ] **Step 5: Commit**
```bash
git add apps/strapi-oyl/src/api/oyl-record/services/upsert-rule.ts apps/strapi-oyl/src/api/oyl-record/services/upsert-rule.test.ts
git commit -m "feat(strapi-oyl-app): pure decideUpsert + toEnvelope for the record store"
```

---

### Task 2: Scaffold the rest of the Strapi app (copy proven boilerplate per R-A)

**Files:** Config, tsconfig, env, `src/index.ts`, the content-type — under `apps/strapi-oyl/`. (`package.json` + root alias were created in Task 1 Step 0; this is the `package.json` content for reference:)
```json
{
  "name": "@oyl/strapi-oyl-app", "private": true, "version": "0.1.0",
  "description": "OYL sync-protocol backend (generic record store) on Strapi 5",
  "scripts": { "build": "strapi build", "develop": "strapi develop", "start": "strapi start", "strapi": "strapi", "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": {
    "@strapi/plugin-users-permissions": "5.47.1", "@strapi/strapi": "5.47.1", "@strapi/utils": "5.47.1",
    "better-sqlite3": "^12.10.0", "pg": "8.8.0",
    "react": "^18.0.0", "react-dom": "^18.0.0", "react-router-dom": "^6.0.0", "styled-components": "^6.0.0"
  },
  "devDependencies": { "@types/node": "^20", "typescript": "^5", "vitest": "^4.1.8" },
  "engines": { "node": ">=18.0.0 <=22.x.x" }
}
```

- [ ] **Step 1: Config + tsconfig (copy from `packages/strapi-oyl`, minimal changes)** — create `apps/strapi-oyl/config/`:
  - `server.ts`, `admin.ts`, `api.ts`, `middlewares.ts`, `plugins.ts` — **copy verbatim** from `packages/strapi-oyl/config/` (they're domain-agnostic infra). In `server.ts`, drop the `mcp` block if undesired (optional). 
  - `database.ts` — copy from `packages/strapi-oyl/config/database.ts` (multi-client, SQLite default at `.tmp/data.db`).
  - `tsconfig.json` — copy `packages/strapi-oyl/tsconfig.json` verbatim.
  - `.env.example` (R-H) with the required secrets, and a dev `.env`:
    ```
    HOST=0.0.0.0
    PORT=1340
    APP_KEYS=key1,key2
    API_TOKEN_SALT=devsalt
    ADMIN_JWT_SECRET=devadminsecret
    TRANSFER_TOKEN_SALT=devtransfersalt
    ENCRYPTION_KEY=devencryptionkey
    JWT_SECRET=devjwtsecret
    DATABASE_CLIENT=sqlite
    ```
    (PORT 1340 to avoid the existing app's 1337; container/compose mapping is SP4.)
  - `src/index.ts` — minimal, no old-app guards:
    ```ts
    import type { Core } from '@strapi/strapi'
    export default {
      register(_ctx: { strapi: Core.Strapi }) {},
      async bootstrap(_ctx: { strapi: Core.Strapi }) {}, // SP2.2 grants the authenticated role the /v1 actions here
    }
    ```

- [ ] **Step 2: The `oyl-record` content-type** — `apps/strapi-oyl/src/api/oyl-record/content-types/oyl-record/schema.json`:
```json
{
  "kind": "collectionType",
  "collectionName": "oyl_records",
  "info": { "singularName": "oyl-record", "pluralName": "oyl-records", "displayName": "OYL Record" },
  "options": { "draftAndPublish": false },
  "attributes": {
    "collection": { "type": "string", "required": true },
    "recordId": { "type": "string", "required": true },
    "data": { "type": "json" },
    "revision": { "type": "integer", "default": 0, "required": true },
    "deletedAt": { "type": "datetime" },
    "owner": { "type": "relation", "relation": "manyToOne", "target": "plugin::users-permissions.user" }
  }
}
```
(No `routes`/`controllers`/`services` core files generated by hand here — Task 3 adds the custom ones. **Do not** create a `routes/oyl-record.ts` core router → no `/api/oyl-records` CRUD, R-E.)

- [ ] **Step 3: Verify the app builds and boots**

Run: `pnpm --filter @oyl/strapi-oyl-app exec strapi build`
Expected: build succeeds (admin + server compiled). If it fails, fix config until it builds (this is the scaffold-verification gate). Optionally `timeout 30 pnpm --filter @oyl/strapi-oyl-app develop` and confirm it starts listening on PORT without crashing, then stop it.

- [ ] **Step 4: Commit**
```bash
git add apps/strapi-oyl package.json
git commit -m "feat(strapi-oyl-app): scaffold standalone Strapi 5 app + generic oyl-record content-type"
```

---

### Task 3: `/v1` routes + controller

**Files:** Create `apps/strapi-oyl/src/api/oyl-record/routes/v1.ts`, `apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts`.

- [ ] **Step 1: Routes** — `routes/v1.ts`:
```ts
export default {
  routes: [
    { method: 'GET',    path: '/v1/:collection',     handler: 'oyl-record.list',    config: { auth: false } },
    { method: 'GET',    path: '/v1/:collection/:id',  handler: 'oyl-record.findOne', config: { auth: false } },
    { method: 'PUT',    path: '/v1/:collection/:id',  handler: 'oyl-record.upsert',  config: { auth: false } },
    { method: 'DELETE', path: '/v1/:collection/:id',  handler: 'oyl-record.remove',  config: { auth: false } },
  ],
}
```

- [ ] **Step 2: Controller** — `controllers/oyl-record.ts`. Wire the pure helpers + `strapi.documents('api::oyl-record.oyl-record')` (signatures verified against the existing app: `findFirst({filters})`, `findMany({filters})`, `create({data})`, `update({documentId,data})`, `delete({documentId})`). Owner is a stub seam.
```ts
import { factories } from '@strapi/strapi'
import { decideUpsert, toEnvelope, type RecordRow } from '../services/upsert-rule'

const UID = 'api::oyl-record.oyl-record' as const

/** SP2.1 stub — SP2.2 returns ctx.state.user.id (and requires auth). */
const ownerOf = (_ctx: unknown): number | null => null

export default factories.createCoreController(UID, ({ strapi }) => {
  const docs = () => strapi.documents(UID)
  const findRow = (collection: string, recordId: string) =>
    docs().findFirst({ filters: { collection: { $eq: collection }, recordId: { $eq: recordId } } }) as Promise<(RecordRow & { documentId: string }) | null>

  return {
    async list(ctx) {
      const { collection } = ctx.params
      const includeDeleted = ctx.query.includeDeleted === '1'
      const filters: Record<string, unknown> = { collection: { $eq: collection } }
      if (!includeDeleted) filters.deletedAt = { $null: true }
      const rows = (await docs().findMany({ filters })) as unknown as RecordRow[]
      ctx.body = { records: rows.map(toEnvelope) }
    },

    async findOne(ctx) {
      const { collection, id } = ctx.params
      const row = await findRow(collection, id)
      if (!row || row.deletedAt) return ctx.notFound()
      ctx.body = toEnvelope(row)
    },

    async upsert(ctx) {
      const { collection, id } = ctx.params
      const { data, revision } = ctx.request.body ?? {}
      const existing = await findRow(collection, id)
      const decision = decideUpsert(existing ? { revision: existing.revision } : undefined, revision ?? null)
      if (decision.action === 'conflict') {
        ctx.status = 409
        ctx.body = { error: { code: 'REVISION_CONFLICT', message: `stale revision for ${collection}/${id}` } }
        return
      }
      const saved =
        decision.action === 'create'
          ? await docs().create({ data: { owner: ownerOf(ctx), collection, recordId: id, data, revision: 1, deletedAt: null } })
          : await docs().update({ documentId: existing!.documentId, data: { data, revision: decision.revision, deletedAt: null } })
      ctx.body = toEnvelope(saved as unknown as RecordRow)
    },

    async remove(ctx) {
      const { collection, id } = ctx.params
      const existing = await findRow(collection, id)
      if (!existing) { ctx.status = 204; return }
      if (ctx.query.purge === '1') {
        await docs().delete({ documentId: existing.documentId })
      } else if (!existing.deletedAt) {
        await docs().update({ documentId: existing.documentId, data: { deletedAt: new Date(), revision: existing.revision + 1 } })
      }
      ctx.status = 204
    },
  }
})
```
**Verify against the running app** (Task 4's smoke test is the check): the `createCoreController` factory + custom methods, `strapi.documents` return shapes (`documentId`, `createdAt`/`updatedAt` present), and that `config: { auth: false }` routes populate `ctx.params`/`ctx.request.body` as expected. Adjust signatures if 5.47 differs — keep the `decideUpsert`/`toEnvelope` logic intact.

- [ ] **Step 3: Build** — `pnpm --filter @oyl/strapi-oyl-app exec strapi build` → succeeds. (End-to-end behavior is verified in Task 4.)

- [ ] **Step 4: Commit**
```bash
git add apps/strapi-oyl/src/api/oyl-record/routes apps/strapi-oyl/src/api/oyl-record/controllers
git commit -m "feat(strapi-oyl-app): /v1 single-record routes + controller (revision/tombstone over the record store)"
```

---

### Task 4: Boot harness + booted smoke test (R-C/R-D) — **exploratory**

**Files:** Create `apps/strapi-oyl/test/boot.ts`, `apps/strapi-oyl/test/oyl-record.smoke.test.ts`. Vitest config if needed (`apps/strapi-oyl/vitest.config.ts` with a long `testTimeout`, e.g. 60_000, since Strapi boot is slow).

- [ ] **Step 1: Research the Strapi 5.47 programmatic boot API.** Determine how to start an app instance in-process listening on an ephemeral port. Expected shape (verify exact names against `@strapi/strapi` 5.47 — `createStrapi`/`compileStrapi`, `.load()`, `.listen()`/`.server.httpServer.listen()`):
```ts
// apps/strapi-oyl/test/boot.ts  (BEST-EFFORT — adjust to the real 5.47 API)
import { createStrapi, compileStrapi } from '@strapi/strapi'

let app: any
export async function boot(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_CLIENT = 'sqlite'
  process.env.DATABASE_FILENAME = '.tmp/test.db'
  // required secrets for boot:
  process.env.APP_KEYS ??= 'k1,k2'
  process.env.JWT_SECRET ??= 'test'; process.env.ADMIN_JWT_SECRET ??= 'test'
  process.env.API_TOKEN_SALT ??= 'test'; process.env.TRANSFER_TOKEN_SALT ??= 'test'; process.env.ENCRYPTION_KEY ??= 'test'
  const ctx = await compileStrapi()
  app = await createStrapi(ctx).load()
  await app.server.mount()
  const server = app.server.httpServer
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address()
  return { baseUrl: `http://127.0.0.1:${port}/api`, stop: async () => { await app.destroy() } } // R-F: baseUrl includes /api
}
export async function truncateRecords(): Promise<void> {
  await app.db.query('api::oyl-record.oyl-record').deleteMany({ where: {} })
}
```
If the in-process API proves too fiddly, fall back to spawning `strapi start` as a child process on a fixed test port and polling until healthy — but prefer in-process. **STOP and report if neither boots after reasonable iteration.**

- [ ] **Step 2: Write the smoke test** — `apps/strapi-oyl/test/oyl-record.smoke.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { boot, truncateRecords } from './boot'

let baseUrl: string
let stop: () => Promise<void>
beforeAll(async () => { ({ baseUrl, stop } = await boot()) }, 60_000)
afterAll(async () => { await stop?.() })
beforeEach(async () => { await truncateRecords() })

const uid = '11111111-1111-4111-8111-111111111111'
const put = (rev: number | null, name = 'Health') =>
  fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { id: uid, name, slug: 'health' }, revision: rev }) })

describe('oyl-record /v1 single-record protocol (booted)', () => {
  it('create → conflict → bump → list → soft delete → purge', async () => {
    const c = await put(null); expect(c.status).toBe(200)
    expect((await c.json()).revision).toBe(1)

    expect((await put(null)).status).toBe(409) // collide with existing

    const u = await put(1); expect(u.status).toBe(200)
    expect((await u.json()).revision).toBe(2)

    const list = await (await fetch(`${baseUrl}/v1/lifeAreas`)).json()
    expect(list.records).toHaveLength(1)

    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { method: 'DELETE' })).status).toBe(204)
    expect((await (await fetch(`${baseUrl}/v1/lifeAreas`)).json()).records).toHaveLength(0)
    expect((await (await fetch(`${baseUrl}/v1/lifeAreas?includeDeleted=1`)).json()).records).toHaveLength(1)

    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}?purge=1`, { method: 'DELETE' })).status).toBe(204)
    expect((await (await fetch(`${baseUrl}/v1/lifeAreas?includeDeleted=1`)).json()).records).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run; iterate to green**

Run: `pnpm --filter @oyl/strapi-oyl-app exec vitest run test/oyl-record.smoke.test.ts`
Expected: the booted round-trip passes. Iterate on `boot.ts` and the controller (document-service signatures, `ctx.request.body` parsing, the `/api/v1` path) until green. If the soft-delete `revision` bump or `deletedAt` filter behaves unexpectedly, fix the controller (keep `decideUpsert`/`toEnvelope` intact). **If boot itself can't be made to work, STOP and report** with what you tried.

- [ ] **Step 4: Full gate** — `pnpm --filter @oyl/strapi-oyl-app exec vitest run && pnpm --filter @oyl/strapi-oyl-app typecheck` → green.

- [ ] **Step 5: Commit**
```bash
git add apps/strapi-oyl/test apps/strapi-oyl/vitest.config.ts
git commit -m "feat(strapi-oyl-app): programmatic boot harness + booted /v1 smoke test"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/strapi-oyl-app exec vitest run` — pure-helper tests + booted smoke test green.
- [ ] `pnpm --filter @oyl/strapi-oyl-app exec strapi build` and `typecheck` — clean.
- [ ] Nothing imports from `packages/strapi-oyl` at runtime. Deliverable: a standalone Strapi app serving the `/v1` single-record protocol over a generic `oyl-record` store, with a reusable boot harness — ready for SP2.2 (real auth + batch + the full `httpProtocolContract` conformance).
