# Backend Wiring SP1 — `HttpRepository` + neutral sync protocol — Design

**Status:** approved (all recommendations baked: generic-document-store shape, online-first, server-enforced revision, backend-agnostic; R1–R11)
**Date:** 2026-06-15
**Package:** `@oyl/all-of-oyl` (`src/core/`)
**Context:** First sub-project of the backend-wiring arc. **Zero backend dependency** — nothing here references `packages/strapi-oyl`. Deliverable: a contract-verified, vendor-neutral networked `Repository` adapter plus the precise HTTP protocol any future backend (`apps/strapi-oyl`, an Express+ORM service, a PHP+JSON server) must implement. Later sub-projects: SP2 a reference backend, SP3 auth/token, SP4 wire vanilla-oyl, SP5 offline-first sync.

---

## What this is

The domain core persists through the `Repository<T>` port (`get/list/save/saveMany/delete/purge`), today via `LocalStorageRepository`. SP1 adds a sibling **`HttpRepository`** that satisfies the *same* port over a small, documented, versioned HTTP "OYL sync protocol" — never any vendor's API conventions. It's proven against an **in-memory protocol fake** (a `fetch`-shaped veneer over `InMemoryRepository`) using the existing `repositoryContract` harness, so it needs no running server. The same conformance harness is **exported** to later validate the real backend.

### Decisions (settled)

1. **Backend-agnostic `HttpRepository`** (not `StrapiRepository`). One canonical protocol; backends conform (R9 — routes are *not* configurable; a non-conforming backend adds a server-side shim).
2. **Generic-document-store data model** (R2): the wire unit is an envelope `{ id, data, revision, createdAt, updatedAt, deletedAt }` where `data` is the collection's opaque codec JSON. The server enforces concurrency on the envelope's `revision` **without parsing `data`** — so the protocol is type-agnostic and implementable as one Strapi content-type / one SQL table / one PHP store.
3. **Server-enforced optimistic concurrency** (`409 → REVISION_CONFLICT`) and **soft-delete tombstones** (`deletedAt`), mirroring `LocalStorageRepository`/`InMemoryRepository` exactly.
4. **Online-first** (R10): the adapter is a thin networked port; reads are batched at hydrate-time by the aggregate stores. Offline/queueing is SP5.
5. **Server derives `owner` from the bearer token** (R8); the adapter never sends an owner.
6. **Split transport from mapping** (R11): `createHttpClient({ baseUrl, fetch, getToken })` once; `createHttpRepository(client, collection, codec)` per collection.
7. **DI everywhere** (R6): `fetch` and `getToken` are injected — no ambient globals.
8. **Protocol versioned** at `/v1` (R4).

### Out of scope

- Any real backend (SP2); auth/login UI + token acquisition (SP3); pointing vanilla-oyl at it (SP4); offline-first sync, retry/idempotency queues (SP5). The online-first retry caveat (a retried-after-timeout write can surface as a spurious `409`) is documented, not solved here.

---

## The OYL Sync Protocol v1 (the contract a backend must implement)

All requests carry `Authorization: Bearer <token>`; the server resolves the **owner** from it and scopes every record to that owner (R8). Base path `{baseUrl}/v1`. `{c}` = collection slug (a `COLLECTIONS` key, URL-encoded); `{id}` = record UUID.

**Record envelope** (JSON):
```jsonc
{ "id": "uuid", "data": { /* opaque codec JSON for the collection */ },
  "revision": 3, "createdAt": "ISO-8601", "updatedAt": "ISO-8601", "deletedAt": null }
```

| Method & path | Body | Success | Semantics |
|---|---|---|---|
| `GET /v1/{c}` `?includeDeleted=1` | — | `200 { "records": Envelope[] }` | Owner's records for `c`; excludes `deletedAt != null` unless `includeDeleted` |
| `GET /v1/{c}/{id}` | — | `200 Envelope` / `404` | `404` when absent (adapter `get` also treats `deletedAt` as `undefined`) |
| `PUT /v1/{c}/{id}` | `{ "data": …, "revision": number\|null }` | `200 Envelope` | **Upsert** (see rule below) |
| `POST /v1/{c}:batch` | `{ "items": [{id,data,revision}] }` | `200 { "records": Envelope[] }` | **Atomic** saveMany — all-or-nothing |
| `DELETE /v1/{c}/{id}` `?purge=1` | — | `204` | Soft tombstone (bump revision); `purge=1` = hard delete. Idempotent |

**Upsert rule (the concurrency contract):**
- **No record exists for `{id}`** → create fresh: server stamps `revision=1`, `createdAt=updatedAt=now`, ignoring any asserted `revision` (this is the "foreign meta for an unknown id ⇒ fresh create" case).
- **Record exists** → require `body.revision === stored.revision`; else `409 REVISION_CONFLICT`. On match, store `data`, set `revision=stored.revision+1`, `updatedAt=now`. (A meta-less `revision:null` against an existing record therefore conflicts — the "fresh save colliding with existing" case.)

**Errors** (JSON `{ "error": { "code", "message" } }`): `401` unauthenticated, `403` forbidden, `404` not found, `409` `REVISION_CONFLICT`, `422` malformed, `5xx` server. (R3 maps these — below.)

This table *is* the SP2 acceptance spec; the exported conformance harness (R1) checks a real server against it.

**Protocol notes (documented for backend authors; not built in SP1):**
- **R15 — `list` is unpaginated** (the aggregate stores hydrate whole collections, matching `LocalStorageRepository`). A `?cursor=`/`limit` extension is a backward-compatible future addition.
- **R16 — the server should cap `data` size** (respond `413` over a limit). Blobs are opaque to the server, so this is the DoS guard the type-agnostic model trades for.
- **R18 — reserve an `Idempotency-Key` request header** (unused in SP1) so SP5 can add retry-dedup without a protocol break.
- **R17 — an OpenAPI/JSON-Schema description** of this table is a nice later add for polyglot (Express/PHP) backend authors; the markdown spec suffices for SP1.

---

## Architecture — `packages/all-of-oyl/src/core/`

### 1. `http-repository.ts` (ships in the browser dist — apps call it at runtime)

```js
/** @typedef {{ id: string, data: unknown, revision: number, createdAt: string, updatedAt: string, deletedAt: string | null }} RecordEnvelope */

/** Discriminated adapter error for non-domain HTTP failures (auth → re-login, transport → retry). */
export class HttpRepositoryError extends Error {
  /** @param {'auth'|'transport'|'server'} kind @param {string} message @param {number} [status] */
  constructor(kind, message, status) { super(message); this.name = 'HttpRepositoryError'; this.kind = kind; this.status = status }
}

/** Shared transport: base URL (+/v1), bearer auth, JSON, error mapping, optional timeout. Reused across all collections (R11). */
export function createHttpClient({ baseUrl, fetch, getToken, timeoutMs }) { /* returns { request(method, path, body?) } */ }

/** A Repository<T> over the sync protocol for one collection (R11). */
export function createHttpRepository(client, collection, codec) { /* returns { get, list, save, saveMany, delete, purge } */ }
```

- **`createHttpClient`** wraps `fetch`: prefixes `{baseUrl}/v1`, attaches `Authorization: Bearer ${token}` **only when `await getToken()` is truthy** (R13 — otherwise omit the header and let the server `401`), sets `Content-Type: application/json`, parses JSON, applies an optional `timeoutMs` via `AbortController` (R14 — abort → `HttpRepositoryError('transport')`), and maps status → errors (R3):
  - `409` → `new DomainError('REVISION_CONFLICT', …)` (so the existing contract passes).
  - `401/403` → `new HttpRepositoryError('auth', …, status)`.
  - network throw / `5xx` → `new HttpRepositoryError('transport'|'server', …)`.
  - `404` is **not** thrown here — returned as a sentinel so `get` can map to `undefined`.
- **`createHttpRepository(client, collection, codec)`** implements the port:
  - `list(opts)` → `GET /{c}[?includeDeleted=1]` → `records.map(reviveEnvelope)`.
  - `get(id)` → `GET /{c}/{id}` → `404` or `deletedAt` ⇒ `undefined`, else `reviveEnvelope`.
  - `save(item)` → `PUT /{c}/{item.id}` `{ data: codec.toJSON(item), revision: item.meta?.revision ?? null }` → `reviveEnvelope`.
  - `saveMany(items)` → `POST /{c}:batch` → `records.map(reviveEnvelope)`.
  - `delete(id)` → `DELETE /{c}/{id}`; `purge(id)` → `DELETE /{c}/{id}?purge=1`.
  - **`reviveEnvelope(env)`** = `const item = codec.fromJSON(env.data); item.meta = metaFromJSON({ createdAt: env.createdAt, updatedAt: env.updatedAt, revision: env.revision, ...(env.deletedAt ? { deletedAt: env.deletedAt } : {}) }); return item`. **The envelope's meta is authoritative** (R2); any `meta` embedded in `data` is ignored. (Sending the full `codec.toJSON(item)` as `data` keeps the adapter codec-agnostic — it makes no assumption about codec internals, so it works for `reviveEntry`/`revivePlan` too.)

### 2. `http-repository-fake.ts` (test/dev utility — excluded from the browser dist, R5)

`createProtocolFake()` → `{ fetch }`, a `fetch`-shaped function implementing the v1 protocol in memory by **delegating to one `InMemoryRepository` per collection** (each record wrapped as `{ id, data, meta }` so `data` rides opaquely while `InMemoryRepository` owns meta/revision/tombstones). Because `InMemoryRepository` already implements the port, the fake's semantics *are* the port; it only does HTTP↔repo translation + `DomainError(REVISION_CONFLICT) → 409`. **R12: the fake constructs each `InMemoryRepository` with a *monotonic* clock** (strictly increasing instants) so the contract's `updatedAt > createdAt` assertion is deterministic, never colliding on a single millisecond. Exported for reuse in vanilla-oyl's own tests and as a zero-backend dev stand-in.

### 3. `http-repository-contract.ts` (conformance harness — excluded from dist, imports vitest, R1)

```js
/** Run the full Repository contract against a server (real or fake) speaking the protocol. */
export function httpProtocolContract(label, { baseUrl, fetch, getToken }) {
  repositoryContract(label, () =>
    createHttpRepository(createHttpClient({ baseUrl, fetch, getToken }), 'lifeAreas', COLLECTIONS.lifeAreas))
}
```
SP1 calls it with the fake's `fetch`; SP2 calls it with real `fetch` + a test server URL + a real token. One executable spec for client and server.

### Build hygiene

`http-repository.ts` ships in `dist/` (browser runtime). `http-repository-fake.ts` and `http-repository-contract.ts` are excluded from `tsconfig.build.json` (the `*-contract.ts` glob already excludes the harness; add `*-fake.ts`) so they never reach the browser bundle. vanilla-oyl consumes the TS source, so its tests can still import the fake. (The bare-import guard already fails the build if anything leaks.)

---

## Error taxonomy (R3)

| HTTP | Adapter result | Rationale |
|---|---|---|
| `200/204` | success | — |
| `404` (get) | `undefined` | absence is not an error for `get` |
| `409` | throw `DomainError('REVISION_CONFLICT')` | contract-tested; app/sync reconciles |
| `401/403` | throw `HttpRepositoryError('auth')` | app triggers re-login |
| network / `5xx` | throw `HttpRepositoryError('transport'\|'server')` | retryable |
| bad codec/meta JSON | `DomainError('MALFORMED_JSON')` (from `fromJSON`/`metaFromJSON`) | corrupt payload |

## Testing (TDD order)

1. **`http-repository-fake.test.js`** — sanity that the fake routes verbs/paths and round-trips an envelope (small; the contract below is the real proof).
2. **`http-repository.test.js`** — `httpProtocolContract('HttpRepository (fake)', { baseUrl:'http://x', fetch: fake.fetch, getToken: async () => 't' })` → the **full `repositoryContract`** passes against the fake (meta stamping, revision conflict, foreign-meta-create, soft delete, idempotent purge). This is the headline test.
3. **Adapter-specific unit tests** (R7) — these **pin protocol fidelity independent of the fake** (the conformance run proves *semantics*; these prove the *wire format* matches `oyl-sync-protocol-v1.md`, guarding against a fake+adapter co-bug that round-trips green but diverges from spec). Against the fake or a spy `fetch`:
   - request shape: `list` hits `GET /v1/{c}`, `save` `PUT /v1/{c}/{id}` with `{data,revision}`, `delete` `DELETE …`, `purge` `?purge=1`, batch `POST /v1/{c}:batch`.
   - `Authorization: Bearer` present; `getToken` invoked per request.
   - `includeDeleted` passthrough (`?includeDeleted=1`).
   - error mapping: stub `fetch` returning `409/401/500`/throwing → `REVISION_CONFLICT`/`auth`/`transport` respectively; `404` on `get` → `undefined`.
   - `reviveEnvelope`: envelope meta wins over any `meta` inside `data`.
   - batch atomicity: a batch with one stale item → `409`, nothing applied.

All run under Vitest with **no network and no backend**.

## File structure

```
packages/all-of-oyl/src/core/
  http-repository.ts            (new — ships: createHttpClient, createHttpRepository, HttpRepositoryError, reviveEnvelope)
  http-repository-fake.ts       (new — test/dev: createProtocolFake; excluded from dist)
  http-repository-contract.ts   (new — exported conformance harness; excluded from dist)
  http-repository.test.js       (new — runs httpProtocolContract against the fake + adapter-specific tests)
  http-repository-fake.test.js  (new — fake sanity)
docs/
  oyl-sync-protocol-v1.md       (new — the human-readable protocol spec for backend authors)
+ packages/all-of-oyl/tsconfig.build.json (modify: exclude *-fake.ts)
+ packages/all-of-oyl/src/index.ts (export createHttpClient/createHttpRepository/HttpRepositoryError; the fake/contract are NOT in the main barrel — import via subpath/source for tests)
```
No app/store/data changes; nothing touches `packages/strapi-oyl`.

## Acceptance

`pnpm all-of test` green (incl. `httpProtocolContract` against the fake — full Repository contract) + `pnpm all-of build` succeeds with the bare-import guard passing and **no `http-repository-fake`/`-contract` in `dist/`**. The deliverable is: a contract-verified `HttpRepository`, an exported in-memory protocol fake + conformance harness, and `docs/oyl-sync-protocol-v1.md` — a precise, machine-checkable spec the SP2 backend (Strapi-in-`apps/`, Express, or PHP) must satisfy, with zero coupling to `packages/strapi-oyl`.
