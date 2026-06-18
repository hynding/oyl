# Storage & Sync Architecture (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot from offline-first sync to **online-first reads + a durable write-outbox + a recent-reads cache** over a **relational Strapi backend**, proven end-to-end on two reference entities — `note` (personal) and `activity` (catalog) — with `@oyl/all-of-oyl` staying canonical via an entity-`kind` manifest + a Strapi parity test.

**Architecture:** Three phases, each leaving its package green. **Phase 1** adds the new lib data-layer primitives (manifest `kind`, write-outbox, API client + read cache, server `PersonalRepository`, catalog client) *alongside* the existing engine (old code still present). **Phase 2** builds the relational Strapi `note` + `activity` content-types (owner-scoping generalized from the existing `oyl-record` controller) + the parity test, and removes `oyl-record`. **Phase 3** rewires the app onto the new layer, builds the Activity catalog UI, removes the auth "skip" path, and *then* retires the offline-first machinery (now unused).

**Tech Stack:** TypeScript (strict `src/`, NodeNext, explicit `.js` extensions), Vitest; Strapi 5 (TS); vanilla JS + JSDoc Web Components, Vitest (happy-dom).

## Global Constraints

- `@oyl/all-of-oyl` `src/`: `"type": "module"` + NodeNext — explicit `.js` import extensions; DOM-free (browser build has no DOM lib; `pnpm all-of build` is the gate); `noUnusedLocals`/`noUnusedParameters`.
- vanilla-oyl: zero-runtime-dep vanilla JS + JSDoc; component tests assert via the component's own shadowRoot.
- **Clean break:** NO data migration, NO backward-compat reads of the old envelope/`oyl-record`. Local + server data are discarded (pre-adoption reset).
- **Account-required:** the auth "skip / use local data" path is removed (Phase 3). `LocalStorageRepository` is **kept compiling + tested** but unwired (basis for future private mode E) — do NOT delete it.
- **Entity `kind`** (`'catalog' | 'personal' | 'system'`) is the authoritative classifier; the data-access path derives from it.
- **Snapshot principle:** a personal record referencing a catalog item snapshots the catalog fields it needs (e.g. `Consumption` already snapshots nutrients) — do not regress this.
- Backend stays owner-scoped (tenant isolation): no content-type may expose another user's rows.
- TDD: failing test first. Never weaken a type/lint rule. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch: `refactor/storage-sync-architecture`.

**Commands:** lib `pnpm --filter @oyl/all-of-oyl test` · `pnpm all-of typecheck:src` · `pnpm all-of build`; app `pnpm vanilla test` · `pnpm vanilla typecheck` · `pnpm vanilla build:lib`; backend `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit` · `pnpm --filter @oyl/strapi-oyl-app test` (needs a prior `strapi build`).

**Reference patterns (read, don't reinvent):** `packages/all-of-oyl/src/core/outbox.ts` (durable queue shape), `core/http-repository.ts` (`createHttpClient`, `RecordEnvelope`, `HttpRepositoryError`), `core/cache-store.ts` (localStorage codec store), `core/repository.ts` (`Repository<T>`), `apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts` (owner-scoping), `apps/vanilla-oyl/src/storage/bootstrap.js` (current wiring).

---

## Phase 1 — `@oyl/all-of-oyl` data-layer primitives

### Task 1: Entity `kind` in the manifest

**Files:**
- Modify: `packages/all-of-oyl/src/collections.ts`
- Test: `packages/all-of-oyl/src/collections.test.ts`

**Interfaces:**
- Produces: `COLLECTIONS[name]` entries gain `kind: EntityKind` (`export type EntityKind = 'catalog' | 'personal' | 'system'`). Helpers `kindOf(name): EntityKind` and `entitiesByKind(kind): CollectionName[]`. Existing codec access unchanged.

- [ ] **Step 1: Write the failing test** — append to `collections.test.ts`:

```ts
import { kindOf, entitiesByKind } from './collections.js'
describe('entity kind', () => {
  it('classifies catalogs, personal records, and system links', () => {
    expect(kindOf('activities')).toBe('catalog')
    expect(kindOf('consumables')).toBe('catalog')
    expect(kindOf('entries')).toBe('personal')
    expect(kindOf('accounts')).toBe('personal')
    expect(kindOf('connections')).toBe('system')
    expect(kindOf('grants')).toBe('system')
  })
  it('every collection has a kind', () => {
    for (const name of Object.keys(COLLECTIONS)) expect(['catalog','personal','system']).toContain(kindOf(/** @type any */(name)))
  })
  it('entitiesByKind groups them', () => {
    expect(entitiesByKind('catalog')).toContain('activities')
    expect(entitiesByKind('personal')).not.toContain('activities')
  })
})
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @oyl/all-of-oyl test collections` → FAIL (`kindOf` undefined).

- [ ] **Step 3: Implement** — change each `COLLECTIONS` value from a bare codec to `{ codec, kind }`, OR keep the codec map and add a parallel `KINDS` map. Use the parallel map to minimize churn to existing codec consumers:

```ts
export type EntityKind = 'catalog' | 'personal' | 'system'

/** Authoritative kind per collection — drives the data-access path. */
export const KINDS: Record<CollectionName, EntityKind> = {
  users: 'personal', lifeAreas: 'catalog', activities: 'catalog', consumables: 'catalog',
  accounts: 'personal', entries: 'personal', goals: 'personal', budgets: 'personal',
  plans: 'personal', projects: 'personal', dayPlans: 'personal', documents: 'personal',
  possessions: 'personal', subscriptions: 'personal', contacts: 'personal', giftIdeas: 'personal',
  connections: 'system', grants: 'system',
}
export function kindOf(name: CollectionName): EntityKind { return KINDS[name] }
export function entitiesByKind(kind: EntityKind): CollectionName[] {
  return (Object.keys(KINDS) as CollectionName[]).filter((n) => KINDS[n] === kind)
}
```
> `goals`/`lifeAreas` kinds are B's call to revisit; classify `lifeAreas` as `catalog` (taxonomy) and `goals` as `personal` for now — both are revisited when B introduces the catalog/instance split.

- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test collections && pnpm all-of typecheck:src && pnpm all-of build` → PASS.

- [ ] **Step 5: Commit** — `git add packages/all-of-oyl/src/collections.ts packages/all-of-oyl/src/collections.test.ts && git commit -m "feat(all-of-oyl): add entity kind (catalog|personal|system) to the manifest\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

### Task 2: Durable write-outbox

**Files:**
- Create: `packages/all-of-oyl/src/core/write-outbox.ts`
- Test: `packages/all-of-oyl/src/core/write-outbox.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Mutation = { id: string; entity: string; op: 'save' | 'delete'; payload: unknown; baseUpdatedAt: string | null; enqueuedAt: string }
  export interface WriteOutbox {
    enqueue(m: Omit<Mutation, 'id' | 'enqueuedAt'>): Mutation   // persists, returns the stored mutation
    peekAll(): Mutation[]                                       // FIFO order
    ack(id: string): void                                      // remove a flushed mutation
    size(): number
  }
  export function createWriteOutbox(storage: StorageLike, key: string, now: () => Date, newId: () => string): WriteOutbox
  ```
  (`StorageLike` from the existing core; `newId` injected to stay DOM/crypto-free — pass `Id.create` or a counter in tests.)
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test** — `write-outbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createWriteOutbox } from './write-outbox.js'

function mem() { const m = new Map<string,string>(); return { getItem:(k:string)=>m.get(k)??null, setItem:(k:string,v:string)=>{m.set(k,v)}, removeItem:(k:string)=>{m.delete(k)} } as any }
const fixedNow = () => new Date('2026-06-18T00:00:00Z')

describe('createWriteOutbox', () => {
  it('enqueues, persists across instances, preserves FIFO, and acks', () => {
    const s = mem(); let n = 0; const id = () => `m${++n}`
    const ob = createWriteOutbox(s, 'oyl/outbox', fixedNow, id)
    ob.enqueue({ entity: 'note', op: 'save', payload: { id: 'a' }, baseUpdatedAt: null })
    ob.enqueue({ entity: 'note', op: 'delete', payload: { id: 'b' }, baseUpdatedAt: '2026-01-01' })
    expect(ob.size()).toBe(2)
    const reloaded = createWriteOutbox(s, 'oyl/outbox', fixedNow, id) // durable
    expect(reloaded.peekAll().map((m) => m.payload)).toEqual([{ id: 'a' }, { id: 'b' }])
    reloaded.ack(reloaded.peekAll()[0].id)
    expect(reloaded.peekAll().map((m) => (m.payload as any).id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @oyl/all-of-oyl test write-outbox` → FAIL (module missing).

- [ ] **Step 3: Implement** — `write-outbox.ts`, following the persistence style of `core/outbox.ts` (read JSON array from `storage[key]`, mutate, write back). Append on enqueue (stamping `id`+`enqueuedAt`), filter on `ack`, parse-tolerant on load (corrupt → `[]`). DOM-free; `StorageLike` injected.

- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test write-outbox && pnpm all-of typecheck:src && pnpm all-of build` → PASS.

- [ ] **Step 5: Commit** — `feat(all-of-oyl): durable write-outbox for online-first writes`.

---

### Task 3: API client (per-entity Strapi REST) + recent-reads cache

**Files:**
- Create: `packages/all-of-oyl/src/core/api-client.ts`, `packages/all-of-oyl/src/core/read-cache.ts`
- Test: `packages/all-of-oyl/src/core/api-client.test.ts`, `packages/all-of-oyl/src/core/read-cache.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // api-client.ts — talks to Strapi 5 content-type REST (flat fields + documentId), JWT-auth.
  export interface ApiClient {
    find(path: string, query?: Record<string, string | number | boolean>): Promise<{ data: unknown[]; meta: unknown }>
    findOne(path: string, id: string): Promise<unknown | undefined>   // 404 → undefined
    create(path: string, data: unknown): Promise<unknown>
    update(path: string, id: string, data: unknown): Promise<unknown>
    remove(path: string, id: string): Promise<void>
  }
  export function createApiClient(opts: { baseUrl: string; fetch: FetchFn; getToken: () => Promise<string | null | undefined>; onAuthError?: () => void }): ApiClient
  // read-cache.ts — bounded recent-reads.
  export interface ReadCache { get(key: string): unknown | undefined; set(key: string, value: unknown): void }
  export function createReadCache(storage: StorageLike, prefix: string, opts: { maxEntries: number; ttlMs: number; now: () => number }): ReadCache
  ```
  Reuse `FetchFn`/`HttpRepositoryError`/auth-error handling style from `core/http-repository.ts` (401/403 → `onAuthError` + `HttpRepositoryError('auth')`, 5xx/network → `'transport'`/`'server'`). Strapi 5 REST envelope: responses wrap rows in `{ data, meta }`; `create`/`update`/`findOne` return `{ data: {...} }` — unwrap `.data`.
- Consumes: `FetchFn`, `HttpRepositoryError` from `http-repository.ts`.

- [ ] **Step 1: Write failing tests** — `api-client.test.ts` (inject a fake `FetchFn` returning Strapi-shaped `{data,meta}`; assert: `find` unwraps the array; `findOne` 404 → `undefined`; `create`/`update` send `{ data }` body + return unwrapped; a 401 calls `onAuthError` and throws `HttpRepositoryError` kind `'auth'`). `read-cache.test.ts` (set/get hit; TTL expiry via injected `now`; LRU eviction past `maxEntries`).

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @oyl/all-of-oyl test api-client read-cache` → FAIL.

- [ ] **Step 3: Implement** both modules. `api-client` builds `${baseUrl}/api/${path}` (note: Strapi REST is under `/api`, not `/v1`), attaches `Authorization: Bearer` when a token exists, maps status→error like `http-repository.ts`. `read-cache` stores `{ value, expiresAt }` per key under `${prefix}${key}` with an in-memory LRU order + `now`-based TTL; DOM-free.

- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test api-client read-cache && pnpm all-of typecheck:src && pnpm all-of build` → PASS.

- [ ] **Step 5: Commit** — `feat(all-of-oyl): API client (Strapi REST) + recent-reads cache`.

---

### Task 4: Server `PersonalRepository` + catalog client

**Files:**
- Create: `packages/all-of-oyl/src/core/server-personal-repository.ts`, `packages/all-of-oyl/src/core/catalog-client.ts`
- Test: matching `.test.ts` for each

**Interfaces:**
- Produces:
  ```ts
  // Personal: Repository-shaped (so existing stores like journal-store consume it unchanged), backed by api-client + write-outbox + read-cache.
  export function createServerPersonalRepository<T extends { id: Id; meta?: PersistedMeta }>(deps: {
    path: string; codec: Codec<T>; api: ApiClient; outbox: WriteOutbox; cache: ReadCache; now: () => Date
  }): Repository<T>
  // Catalog: read-mostly + user-contributed create; NOT Repository-shaped (no owner/delete semantics).
  export interface CatalogClient<T> {
    search(q: string): Promise<T[]>; list(): Promise<T[]>; get(id: Id): Promise<T | undefined>; create(item: T): void  // create enqueues via outbox
  }
  export function createCatalogClient<T extends { id: Id }>(deps: { path: string; codec: Codec<T>; api: ApiClient; outbox: WriteOutbox; cache: ReadCache }): CatalogClient<T>
  ```
- Consumes: `Repository<T>` (`repository.ts`), `Codec` (`collections.ts`), `ApiClient` (T3), `WriteOutbox` (T2), `ReadCache` (T3).

- [ ] **Step 1: Write failing tests** — with a fake `ApiClient` + in-memory outbox/cache:
  - personal repo: `list()` returns codec-decoded rows from `api.find` (and caches them); `get(id)` returns decoded row or `undefined`; `save(item)` **enqueues a `save` mutation** (optimistic) and returns the item; `delete(id)` enqueues a `delete` mutation. (Flush is the app's flusher; the repo only enqueues.)
  - catalog client: `search('run')` calls `api.find(path, { 'filters[name][$containsi]': 'run' })` and decodes; `create(item)` enqueues a catalog `save` mutation (no owner).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** both. Personal repo: reads go api→codec→cache; writes go through the outbox (entity = `path`); it satisfies `Repository<T>` (`saveMany`/`purge` may enqueue per-item / a purge op). Catalog client mirrors reads; `create` enqueues.
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test server-personal catalog-client && pnpm all-of typecheck:src && pnpm all-of build`.
- [ ] **Step 5: Commit** — `feat(all-of-oyl): server PersonalRepository + catalog client over the API/outbox`.

---

## Phase 2 — `apps/strapi-oyl` relational backend

### Task 5: `note` content-type (personal, owner-scoped)

**Files:**
- Create: `apps/strapi-oyl/src/api/note/content-types/note/schema.json`, `.../note/controllers/note.ts`, `.../note/routes/note.ts`
- Modify: `apps/strapi-oyl/src/index.ts` (extend the bootstrap permission grant to the note actions)
- Test: `apps/strapi-oyl/tests/` (add a `note` owner-scoping case alongside the existing harness)

**Interfaces:**
- Produces: a `note` collectionType mirroring `@oyl/all-of-oyl` Note fields (e.g. `body: text`, `occurredAt: datetime`, the Note's own `id` as a string field `recordId` or use Strapi documentId — **store the domain `id` as a required unique string field so client ids round-trip**), `owner` manyToOne relation, owner-scoped find/findOne/create/update/delete.

- [ ] **Step 1: Write the failing test** — a booted-Strapi test: user A creates a note via `POST /api/notes`; user B's `GET /api/notes` does not include it; A's does. (Model on the existing `httpProtocolContract` harness in the strapi test suite.)
- [ ] **Step 2: Build + run, verify fail** — `pnpm --filter @oyl/strapi-oyl-app exec strapi build && pnpm --filter @oyl/strapi-oyl-app test` → FAIL (no `note` type).
- [ ] **Step 3: Implement** — `schema.json` (attributes per Note + `owner` relation + the domain-id string field); a controller via `factories.createCoreController` that **overrides find/findOne/create/update/delete to scope by `ctx.state.user.id`** (inject `owner` filter on reads, set `owner` on create, 401 when unauthenticated) — generalize the owner-scoping in `api/oyl-record/controllers/oyl-record.ts`; default routes. In `index.ts`, add the `note` CRUD actions to the authenticated-role grant (extend the existing `V1_ACTIONS`/`grantAuthenticated` pattern to `api::note.note.{find,findOne,create,update,delete}`).
- [ ] **Step 4: Run, verify pass** — build + `pnpm --filter @oyl/strapi-oyl-app test` → PASS; `tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): owner-scoped relational note content-type`.

---

### Task 6: `activity` content-type (catalog: creator + visibility + search)

**Files:** mirror Task 5 under `apps/strapi-oyl/src/api/activity/...`; modify `index.ts` grant.

**Interfaces:**
- Produces: an `activity` collectionType mirroring `@oyl/all-of-oyl` Activity (name + the metric-definition fields) + `creator` relation + `visibility` enum (`'private' | 'public'`, default `'public'` — A's default policy; B may refine). Reads are **not** owner-restricted: `find`/`findOne` return items where `visibility = 'public'` OR `creator = current user` (so contributed items are shared but private ones aren't). `create` sets `creator = current user`. Search supported via `filters[name][$containsi]`.

- [ ] **Step 1: Write the failing test** — booted Strapi: user A creates an Activity (`visibility public`); user B's `GET /api/activities?filters[name][$containsi]=...` includes it; a `visibility private` item created by A is NOT visible to B but IS to A.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** — schema + a controller whose find/findOne apply the `public-or-mine` filter and whose create stamps `creator`; routes; extend the `index.ts` grant to `api::activity.activity.{find,findOne,create,update,delete}`.
- [ ] **Step 4: Run, verify pass** — build + test + tsc clean.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): catalog activity content-type (creator + visibility + search)`.

---

### Task 7: Parity test + remove `oyl-record`

**Files:**
- Create: `packages/all-of-oyl/src/collections.parity.test.ts` (lib-side; reads the Strapi schema.json files via a relative path) OR `apps/strapi-oyl/tests/parity.test.ts` (backend-side). Put it backend-side — it has the schema files and a test runner already.
- Delete: `apps/strapi-oyl/src/api/oyl-record/**`, `docs/oyl-sync-protocol-v1.md`
- Modify: `apps/strapi-oyl/src/index.ts` (drop the `oyl-record` `V1_ACTIONS` grant)

**Interfaces:**
- Produces: a parity test asserting that for each manifest entity with a built content-type, the Strapi `schema.json` attributes cover the manifest's field schema (names + compatible types) and declare `owner` (personal) or `creator`+`visibility` (catalog).

- [ ] **Step 1: Write the failing parity test** — for `note` + `activity`: load their `schema.json`, assert required fields present with compatible types and the correct relation fields per `kindOf`. (Until the manifest exposes a per-entity field schema, assert against an explicit expected-field list for the two reference entities; B generalizes it.)
- [ ] **Step 2: Run, verify fail or pass-then-break** — run; confirm it meaningfully checks (temporarily rename a field to see it fail, then restore).
- [ ] **Step 3: Remove `oyl-record`** — `git rm -r apps/strapi-oyl/src/api/oyl-record`; delete `docs/oyl-sync-protocol-v1.md`; remove the `oyl-record` actions from `index.ts` (keep `grantAuthenticated` for note/activity + `grantPublicAuth`). The existing `httpProtocolContract` test (which targets `/v1` envelope) is removed/replaced — delete it since the protocol is gone.
- [ ] **Step 4: Build + run, verify green** — `pnpm --filter @oyl/strapi-oyl-app exec strapi build && pnpm --filter @oyl/strapi-oyl-app test && pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit`.
- [ ] **Step 5: Commit** — `refactor(strapi-oyl): parity test for note/activity; remove generic oyl-record + protocol`.

---

## Phase 3 — `apps/vanilla-oyl` rewire + retire old machinery

### Task 8: Rewire the data layer onto the server repositories

**Files:**
- Rewrite: `apps/vanilla-oyl/src/storage/bootstrap.js` (`makeRepositories` builds server repos from `createApiClient` + `createWriteOutbox` + `createReadCache`, routing per `kindOf`); add a flusher driven by `Connectivity`.
- Modify: `apps/vanilla-oyl/src/state/data.js`, `apps/vanilla-oyl/src/main.js` (drop the engine/`startSync`/cursor wiring; build the api client + outbox + cache; start the flusher), `apps/vanilla-oyl/src/storage/keys.js` (outbox + read-cache keys).
- Test: `apps/vanilla-oyl/src/storage/bootstrap.test.js` (or the existing data tests) — `makeRepositories` returns repos keyed by `COLLECTIONS`; personal repos enqueue writes; the flusher drains the outbox when online.

**Interfaces:**
- Consumes: T1–T4 lib primitives + T5 `note` endpoint.
- Produces: `makeRepositories(storage, { apiClient, connectivity })` → `{ repos, flush }`; `repos.entries`/etc. are server `PersonalRepository`s; catalog access exposed via a `catalogs` map of `CatalogClient`s.

- [ ] **Step 1: Write the failing test** — assert `makeRepositories` builds a personal repo per `entitiesByKind('personal')` and a catalog client per `entitiesByKind('catalog')`; a `save` enqueues to the outbox; calling `flush()` while a fake connectivity reports online POSTs via the api client and acks.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — rewrite `makeRepositories` (drop the `createSyncEngine`/`createHttpRepository`/`createCacheStore`/`createCursorStore` path); build one `ApiClient`, one `WriteOutbox`, one `ReadCache`; for each personal entity a `createServerPersonalRepository`, for each catalog a `createCatalogClient`. Add `createFlusher(outbox, apiClient, connectivity)` (flush on online + on enqueue). Wire in `main.js`/`data.js`: build the api client (reuse the existing `getApiBaseUrl`/`createBrowserConnectivity`), start the flusher; remove `startSync`/`resync`/cursor/migration code paths.
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test`. (journal-store should work unchanged against the new `repos.entries` since it's `Repository`-shaped.)
- [ ] **Step 5: Commit** — `refactor(vanilla-oyl): online-first data layer (api client + outbox + cache)`.

---

### Task 9: Activity catalog in the app (search/select/contribute)

**Files:**
- Modify: the activity composer/nutrition area (`apps/vanilla-oyl/src/components/oyl-nutrition-composer.js` already has a catalog "From consumable" picker — add/wire an **Activity** search/select + "add new" against `catalogs.activities`), or add a focused `oyl-activity-picker.js`.
- Test: matching component test (search filters; selecting fills; "add new" enqueues a catalog create).

**Interfaces:**
- Consumes: the `catalogs.activities` `CatalogClient` from Task 8.

- [ ] **Step 1: Write the failing test** — a picker bound to a fake `CatalogClient`: typing filters via `search`; selecting emits the chosen activity; "add new" calls `create`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the picker component (own shadowRoot; `{ signal: this.lifecycle }`), wired to `catalogs.activities`.
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla test <picker> && pnpm vanilla typecheck`.
- [ ] **Step 5: Commit** — `feat(vanilla-oyl): Activity catalog search/select/contribute`.

---

### Task 10: Remove the auth "skip / use local data" path

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-login.js`, `oyl-register.js` (remove the `[data-act="skip"]` button + `onSkip`), `apps/vanilla-oyl/src/main.js` (remove the skip route wiring + local-mode branch; account-required), and the `oyl-login`/`oyl-register` tests (drop skip assertions).

- [ ] **Step 1: Update tests** — remove the skip assertions; add an assertion that no `[data-act="skip"]` exists.
- [ ] **Step 2: Run, verify fail** — the new negative assertions fail (skip still present).
- [ ] **Step 3: Implement** — delete the skip button + `onSkip` prop from both pages; remove the `setStorageMode(local)`/skip wiring in `main.js`; remove the now-dead `getStorageMode`/local-mode branch (the app is always remote/account-required).
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla test oyl-login oyl-register && pnpm vanilla typecheck && pnpm vanilla test` (full).
- [ ] **Step 5: Commit** — `refactor(vanilla-oyl): account-required; remove skip/use-local-data path`.

---

### Task 11: Retire the offline-first machinery + final sweep

**Files:**
- Delete (lib): `packages/all-of-oyl/src/core/sync-engine.ts`(+test), `cursor-store.ts`(+test), `http-repository-contract.ts`, `http-repository.conformance.test.ts`, `http-repository-fake.ts`(+test), `repository-contract.ts`(+test) — **only** those no longer imported. Keep `local-storage-repository.ts`, `cache-store.ts` (cache-store may be reused by read-cache? if not used, keep or remove per imports), `http-repository.ts` (still provides `FetchFn`/`HttpRepositoryError` used by api-client — keep those; remove the envelope `createHttpRepository`/`createHttpClient` only if unused).
- Modify: `packages/all-of-oyl/src/index.ts` (drop removed exports incl. `@oyl/all-of-oyl/testing` if the contract is gone), `package.json` exports if `/testing` subpath is removed.
- Modify: `CLAUDE.md` (describe the new online-first architecture; remove sync-engine/oyl-record/offline-first claims).

- [ ] **Step 1: Find dead modules** — `grep -rn "sync-engine\|createSyncEngine\|cursor-store\|createCursorStore\|http-repository-contract\|httpProtocolContract\|createHttpRepository" packages/all-of-oyl/src apps/vanilla-oyl/src apps/strapi-oyl` — confirm the app/backend no longer import them (Phase 2/Task 8 removed the consumers).
- [ ] **Step 2: Delete** the confirmed-dead modules + their tests (`git rm`); prune `index.ts` exports + the `/testing` export map entry.
- [ ] **Step 3: Update CLAUDE.md** — replace the offline-first / oyl-record / sync-protocol / backend-agnostic descriptions with: online-first reads + write-outbox + recent-reads cache; relational Strapi content-types (owner-scoped personal + creator/visibility catalog); entity `kind` manifest + parity test; account-required (private mode planned, sub-project E); `LocalStorageRepository` retained dormant.
- [ ] **Step 4: Full repo-wide green** — `pnpm --filter @oyl/all-of-oyl test && pnpm all-of typecheck:src && pnpm all-of build && pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test && pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit && pnpm --filter @oyl/strapi-oyl-app test`.
- [ ] **Step 5: Commit** — `refactor: retire offline-first sync engine + conformance contract; docs`.

---

## Manual acceptance (after Task 11)

Run the backend + app (fresh DB). Sign in → log a **Journal note offline** (devtools offline) → reconnect → the note POSTs and is present server-side and on a second session. Search the **Activity catalog**, add a new Activity, and re-find it. Confirm no "skip / use local data" affordance exists.

## Self-review notes (coverage map)

- Spec A1 (runtime: reads/writes/cache/connectivity) → Tasks 2,3,4,8. A2 (relational Strapi, owner-scoped, hybrid reads) → Tasks 5,6 (+ C for composites). A3 (manifest kind + parity) → Tasks 1,7. A4 (entity kinds, personal seam, catalog path, snapshot principle, latent catalogs) → Tasks 1,4,8,9 (snapshot principle is a B-enforced cross-cutting rule; A preserves Consumption's existing snapshot). A5 (account-required; remove skip; LocalStorageRepository kept) → Tasks 10,11. A6 (LWW + notice) → server upsert revision behavior carried into the personal repo's `baseUpdatedAt`/conflict surfacing (Task 4/8); the user-facing "changed elsewhere" notice rides the existing notice state. A7 (reference entities note+activity) → Tasks 5,6,8,9. Retirements → Task 11.
- **Deferred to B/C/D/E (not this plan):** the full catalog visibility/curation/dedup policy (A defaults `public`); composite timeline/search endpoints; full entity migration; private mode + the local repo wiring.
