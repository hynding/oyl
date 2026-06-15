# Backend SP1 — `HttpRepository` + neutral sync protocol — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendor-neutral `HttpRepository` adapter for the domain `Repository` port, plus a documented HTTP sync protocol, proven against an in-memory fake via the existing `repositoryContract` — zero backend, nothing touching `packages/strapi-oyl`.

**Architecture:** `src/core/` (strict TypeScript, NodeNext, explicit `.js` import extensions). A shared `createHttpClient` (transport) + per-collection `createHttpRepository`; an `InMemoryRepository`-backed `createProtocolFake`; an exported `httpProtocolContract` harness. The adapter ships in `dist/`; the fake + harness are excluded.

**Tech Stack:** TypeScript (strict), Vitest, `fetch`/`Response`/`URL` (Web/Node globals).

**Spec:** `docs/superpowers/specs/2026-06-15-all-of-oyl-http-repository-design.md`

**Branch:** `feat/all-of-http-repository` (off `master` HEAD). Baseline: `pnpm all-of test` green (371 tests).

---

## File structure

- **Create** `packages/all-of-oyl/src/core/http-repository.ts` (ships) — `createHttpClient`, `createHttpRepository`, `HttpRepositoryError`, `RecordEnvelope`.
- **Create** `packages/all-of-oyl/src/core/http-repository-fake.ts` (excluded) — `createProtocolFake`.
- **Create** `packages/all-of-oyl/src/core/http-repository-contract.ts` (excluded) — `httpProtocolContract`.
- **Create** tests: `http-repository-fake.test.ts`, `http-repository.test.ts` (adapter-specific), `http-repository.conformance.test.ts` (runs the harness).
- **Create** `docs/oyl-sync-protocol-v1.md`.
- **Modify** `packages/all-of-oyl/tsconfig.build.json` (exclude `*-fake.ts`), `packages/all-of-oyl/src/index.ts` (export the adapter).

---

### Task 1: The protocol fake (`createProtocolFake`)

**Files:** Create `src/core/http-repository-fake.ts`, `src/core/http-repository-fake.test.ts`.

- [ ] **Step 1: Write the failing test**

`packages/all-of-oyl/src/core/http-repository-fake.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createProtocolFake } from './http-repository-fake.js'

const TOKEN = 'Bearer t'
const j = (res: Response) => res.json()

describe('createProtocolFake', () => {
  it('round-trips a PUT then GET, stamping envelope meta', async () => {
    const { fetch } = createProtocolFake()
    const put = await fetch('http://x/v1/lifeAreas/a1', { method: 'PUT', headers: { Authorization: TOKEN }, body: JSON.stringify({ data: { id: 'a1', name: 'Health' }, revision: null }) })
    expect(put.status).toBe(200)
    const env = await j(put)
    expect(env).toMatchObject({ id: 'a1', revision: 1, deletedAt: null })
    expect(typeof env.createdAt).toBe('string')

    const list = await j(await fetch('http://x/v1/lifeAreas', { headers: { Authorization: TOKEN } }))
    expect(list.records).toHaveLength(1)
  })

  it('returns 409 on a stale revision and 404 for a missing record', async () => {
    const { fetch } = createProtocolFake()
    await fetch('http://x/v1/lifeAreas/a1', { method: 'PUT', body: JSON.stringify({ data: { id: 'a1', name: 'A' }, revision: null }) })
    const stale = await fetch('http://x/v1/lifeAreas/a1', { method: 'PUT', body: JSON.stringify({ data: { id: 'a1', name: 'B' }, revision: null }) })
    expect(stale.status).toBe(409)
    expect((await j(stale)).error.code).toBe('REVISION_CONFLICT')
    expect((await fetch('http://x/v1/lifeAreas/zzz')).status).toBe(404)
  })

  it('soft-deletes (204) and excludes from list unless includeDeleted=1', async () => {
    const { fetch } = createProtocolFake()
    await fetch('http://x/v1/lifeAreas/a1', { method: 'PUT', body: JSON.stringify({ data: { id: 'a1', name: 'A' }, revision: null }) })
    expect((await fetch('http://x/v1/lifeAreas/a1', { method: 'DELETE' })).status).toBe(204)
    expect((await j(await fetch('http://x/v1/lifeAreas'))).records).toHaveLength(0)
    expect((await j(await fetch('http://x/v1/lifeAreas?includeDeleted=1'))).records).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run; verify FAIL**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository-fake.test.ts`
Expected: FAIL — cannot resolve `./http-repository-fake.js`.

- [ ] **Step 3: Implement**

`packages/all-of-oyl/src/core/http-repository-fake.ts`:
```ts
import { InMemoryRepository } from './in-memory-repository.js'
import { DomainError } from './domain-error.js'
import { metaToJSON, type PersistedMeta } from './persisted-meta.js'
import type { Id } from './id.js'

type Row = { id: Id; data: unknown; meta?: PersistedMeta }

/** Monotonic, tick-per-call clock from 2026-06-01 so contract timestamps are strictly increasing (R12). */
function tickClock(): () => Date {
  let n = 0
  const base = Date.UTC(2026, 5, 1)
  return () => new Date(base + n++ * 1000)
}

function toEnvelope(row: Row) {
  const m = metaToJSON(row.meta!)
  return { id: row.id, data: row.data, revision: m.revision, createdAt: m.createdAt, updatedAt: m.updatedAt, deletedAt: m.deletedAt ?? null }
}

/** Wrap the body's {revision} as the row meta InMemoryRepository compares (createdAt/updatedAt are restamped by it). */
function rowFrom(id: Id, data: unknown, revision: number | null | undefined): Row {
  return revision != null ? { id, data, meta: { createdAt: new Date(0), updatedAt: new Date(0), revision } } : { id, data }
}

/**
 * A `fetch`-shaped in-memory implementation of the OYL sync protocol v1, delegating to one
 * InMemoryRepository per collection — so its semantics ARE the Repository port. Test/dev only.
 */
export function createProtocolFake(): { fetch: typeof fetch } {
  const clock = tickClock()
  const repos = new Map<string, InMemoryRepository<Row>>()
  const repo = (c: string) => {
    let r = repos.get(c)
    if (!r) { r = new InMemoryRepository<Row>(clock); repos.set(c, r) }
    return r
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init?.method ?? 'GET').toUpperCase()
    const rest = url.pathname.replace(/^.*\/v1\//, '')
    const isBatch = rest.endsWith(':batch')
    const [collectionRaw, idRaw] = isBatch ? [rest.slice(0, -':batch'.length)] : rest.split('/')
    const collection = decodeURIComponent(collectionRaw!)
    const id = idRaw ? (decodeURIComponent(idRaw) as Id) : undefined
    const r = repo(collection)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    try {
      if (method === 'GET' && !id) {
        const rows = await r.list({ includeDeleted: url.searchParams.get('includeDeleted') === '1' })
        return json(200, { records: rows.map(toEnvelope) })
      }
      if (method === 'GET' && id) {
        const row = await r.get(id)
        return row ? json(200, toEnvelope(row)) : json(404, { error: { code: 'NOT_FOUND', message: id } })
      }
      if (method === 'POST' && isBatch) {
        const items: Row[] = body.items.map((it: { id: Id; data: unknown; revision: number | null }) => rowFrom(it.id, it.data, it.revision))
        return json(200, { records: (await r.saveMany(items)).map(toEnvelope) })
      }
      if (method === 'PUT' && id) {
        return json(200, toEnvelope(await r.save(rowFrom(id, body.data, body.revision))))
      }
      if (method === 'DELETE' && id) {
        if (url.searchParams.get('purge') === '1') await r.purge(id)
        else await r.delete(id)
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 405 })
    } catch (err) {
      if (err instanceof DomainError && err.code === 'REVISION_CONFLICT') {
        return json(409, { error: { code: 'REVISION_CONFLICT', message: err.message } })
      }
      return json(500, { error: { code: 'SERVER', message: err instanceof Error ? err.message : String(err) } })
    }
  }
  return { fetch: fakeFetch as unknown as typeof fetch }
}
```

- [ ] **Step 4: Run; verify PASS**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository-fake.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck** — `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → clean.

- [ ] **Step 6: Commit**
```bash
git add packages/all-of-oyl/src/core/http-repository-fake.ts packages/all-of-oyl/src/core/http-repository-fake.test.ts
git commit -m "feat(all-of-oyl): in-memory OYL sync-protocol fake (InMemoryRepository-backed)"
```

---

### Task 2: The adapter (`createHttpClient` + `createHttpRepository`)

**Files:** Create `src/core/http-repository.ts`, `src/core/http-repository.test.ts`.

- [ ] **Step 1: Write the failing tests** (adapter-specific — pin wire shape/auth/errors, R7)

`packages/all-of-oyl/src/core/http-repository.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createHttpClient, createHttpRepository, HttpRepositoryError } from './http-repository.js'
import { createProtocolFake } from './http-repository-fake.js'
import { DomainError } from './domain-error.js'
import { COLLECTIONS } from '../collections.js'

const codec = COLLECTIONS.lifeAreas
const deps = (fetch: typeof globalThis.fetch, getToken = async () => 'tok') =>
  createHttpRepository(createHttpClient({ baseUrl: 'http://x', fetch, getToken }), 'lifeAreas', codec)

describe('createHttpRepository — wire shape & auth', () => {
  it('sends Bearer auth and the right method/path/body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetch = vi.fn(async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ records: [] }), { status: 200 }) }) as any
    await deps(fetch).list()
    expect(calls[0]!.url).toBe('http://x/v1/lifeAreas')
    expect((calls[0]!.init.headers as any).Authorization).toBe('Bearer tok')
  })

  it('omits Authorization when getToken is falsy (R13)', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 })) as any
    await deps(fetch, async () => '').list()
    expect((fetch.mock.calls[0][1].headers as any).Authorization).toBeUndefined()
  })

  it('passes includeDeleted and purge query params', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 })) as any
    await deps(fetch).list({ includeDeleted: true })
    expect(String(fetch.mock.calls[0][0])).toContain('includeDeleted=1')
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deps(fetch).purge('id1' as any)
    expect(String(fetch.mock.calls[1][0])).toContain('purge=1')
  })

  it('maps statuses to errors: 409→REVISION_CONFLICT, 401→auth, 500→server, 404(get)→undefined', async () => {
    const at = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as any
    await expect(deps(at(409, { error: { code: 'REVISION_CONFLICT' } })).save({ id: 'a' } as any)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    await expect(deps(at(409)).save({ id: 'a' } as any)).rejects.toBeInstanceOf(DomainError)
    await expect(deps(at(401)).list()).rejects.toMatchObject({ kind: 'auth' })
    await expect(deps(at(500)).list()).rejects.toBeInstanceOf(HttpRepositoryError)
    expect(await deps(at(404)).get('missing' as any)).toBeUndefined()
  })

  it('reviveEnvelope: envelope meta wins over meta embedded in data (R2)', async () => {
    const env = { id: 'a1', data: { id: 'a1', name: 'Health', meta: { createdAt: '2000-01-01T00:00:00Z', updatedAt: '2000-01-01T00:00:00Z', revision: 99 } }, revision: 4, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-02T00:00:00Z', deletedAt: null }
    const fetch = vi.fn(async () => new Response(JSON.stringify(env), { status: 200 })) as any
    const got = await deps(fetch).get('a1' as any)
    expect(got!.meta!.revision).toBe(4)
  })

  it('round-trips through the protocol fake', async () => {
    const repo = deps(createProtocolFake().fetch)
    const saved = await repo.save({ id: 'a1', name: 'Health' } as any)
    expect(saved.meta!.revision).toBe(1)
    expect(await repo.list()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run; verify FAIL** — `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository.test.ts` → cannot resolve `./http-repository.js`.

- [ ] **Step 3: Implement**

`packages/all-of-oyl/src/core/http-repository.ts`:
```ts
import { DomainError } from './domain-error.js'
import { metaFromJSON } from './persisted-meta.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'
import type { Codec } from '../collections.js' // Codec is defined in src/collections.ts; type-only import → erased, no runtime cycle with the barrel

/** Wire shape for one stored record; `data` is the collection's opaque codec JSON. */
export interface RecordEnvelope {
  id: string
  data: unknown
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Non-domain HTTP failures, discriminated so callers can react (auth → re-login, transport → retry). */
export class HttpRepositoryError extends Error {
  readonly kind: 'auth' | 'transport' | 'server'
  readonly status?: number
  constructor(kind: 'auth' | 'transport' | 'server', message: string, status?: number) {
    super(message)
    this.name = 'HttpRepositoryError'
    this.kind = kind
    this.status = status
  }
}

export interface HttpClient {
  /** 2xx → parsed JSON (204/404 → undefined); 409 → DomainError(REVISION_CONFLICT); 401/403 → auth; 5xx/network → transport/server. */
  request(method: string, path: string, body?: unknown): Promise<unknown>
}

export function createHttpClient(opts: {
  baseUrl: string
  fetch: typeof globalThis.fetch
  getToken: () => Promise<string | undefined | null>
  timeoutMs?: number
}): HttpClient {
  const root = `${opts.baseUrl.replace(/\/$/, '')}/v1`
  return {
    async request(method, path, body) {
      const token = await opts.getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}` // R13
      const ctrl = opts.timeoutMs ? new AbortController() : undefined // R14
      const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : undefined
      let res: Response
      try {
        res = await opts.fetch(`${root}${path}`, {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          ...(ctrl ? { signal: ctrl.signal } : {}),
        })
      } catch (err) {
        throw new HttpRepositoryError('transport', err instanceof Error ? err.message : String(err))
      } finally {
        if (timer) clearTimeout(timer)
      }
      if (res.status === 204 || res.status === 404) return undefined
      if (res.ok) return res.json()
      if (res.status === 409) {
        const b = await res.json().catch(() => ({}))
        throw new DomainError('REVISION_CONFLICT', b?.error?.message ?? 'revision conflict')
      }
      if (res.status === 401 || res.status === 403) throw new HttpRepositoryError('auth', `unauthorized (${res.status})`, res.status)
      throw new HttpRepositoryError('server', `server error (${res.status})`, res.status)
    },
  }
}

export function createHttpRepository<T extends { id: Id; meta?: PersistedMeta }>(
  client: HttpClient,
  collection: string,
  codec: Codec<T>,
): Repository<T> {
  const base = `/${encodeURIComponent(collection)}`
  const at = (id: Id) => `${base}/${encodeURIComponent(id)}`
  const revive = (env: RecordEnvelope): T => {
    const item = codec.fromJSON(env.data)
    item.meta = metaFromJSON({
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
      revision: env.revision,
      ...(env.deletedAt ? { deletedAt: env.deletedAt } : {}),
    })
    return item
  }
  return {
    async get(id) {
      const env = (await client.request('GET', at(id))) as RecordEnvelope | undefined
      return env && !env.deletedAt ? revive(env) : undefined
    },
    async list(opts) {
      const res = (await client.request('GET', `${base}${opts?.includeDeleted ? '?includeDeleted=1' : ''}`)) as { records: RecordEnvelope[] }
      return res.records.map(revive)
    },
    async save(item) {
      const env = (await client.request('PUT', at(item.id), { data: codec.toJSON(item), revision: item.meta?.revision ?? null })) as RecordEnvelope
      return revive(env)
    },
    async saveMany(items) {
      if (items.length === 0) return []
      const res = (await client.request('POST', `${base}:batch`, { items: items.map((i) => ({ id: i.id, data: codec.toJSON(i), revision: i.meta?.revision ?? null })) })) as { records: RecordEnvelope[] }
      return res.records.map(revive)
    },
    async delete(id) {
      await client.request('DELETE', at(id))
    },
    async purge(id) {
      await client.request('DELETE', `${at(id)}?purge=1`)
    },
  }
}
```

- [ ] **Step 4: Run; verify PASS** — `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository.test.ts` → all pass.

- [ ] **Step 5: Typecheck** — `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → clean. (If `item.meta =` errors because `Codec<T>`'s `T` doesn't expose a writable `meta`, confirm `T extends { id: Id; meta?: PersistedMeta }` is on `createHttpRepository` — it is; the domain entities all carry a writable `meta?`.)

- [ ] **Step 6: Commit**
```bash
git add packages/all-of-oyl/src/core/http-repository.ts packages/all-of-oyl/src/core/http-repository.test.ts
git commit -m "feat(all-of-oyl): HttpRepository adapter + createHttpClient over the OYL sync protocol"
```

---

### Task 3: Conformance harness + headline contract run

**Files:** Create `src/core/http-repository-contract.ts`, `src/core/http-repository.conformance.test.ts`.

- [ ] **Step 1: Write the failing test**

`packages/all-of-oyl/src/core/http-repository.conformance.test.ts`:
```ts
import { httpProtocolContract } from './http-repository-contract.js'
import { createProtocolFake } from './http-repository-fake.js'

// Fresh fake per repo so each contract case starts empty (R1: same harness later points at a real server).
httpProtocolContract('HttpRepository (protocol fake)', () => ({
  baseUrl: 'http://fake',
  fetch: createProtocolFake().fetch,
  getToken: async () => 'test',
}))
```

- [ ] **Step 2: Run; verify FAIL** — `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository.conformance.test.ts` → cannot resolve `./http-repository-contract.js`.

- [ ] **Step 3: Implement**

`packages/all-of-oyl/src/core/http-repository-contract.ts`:
```ts
import { repositoryContract } from './repository-contract.js'
import { createHttpClient, createHttpRepository } from './http-repository.js'
import { COLLECTIONS } from '../collections.js'

/**
 * Run the full Repository contract against any server speaking the OYL sync protocol.
 * `makeDeps` returns fresh per-test transport deps (a fresh fake, or a real fetch+URL with a
 * reset server). Reused by SP1 (fake) and SP2 (real backend) — one executable spec (R1).
 */
export function httpProtocolContract(
  label: string,
  makeDeps: () => { baseUrl: string; fetch: typeof globalThis.fetch; getToken: () => Promise<string | undefined | null> },
): void {
  repositoryContract(label, () => {
    const { baseUrl, fetch, getToken } = makeDeps()
    return createHttpRepository(createHttpClient({ baseUrl, fetch, getToken }), 'lifeAreas', COLLECTIONS.lifeAreas)
  })
}
```

- [ ] **Step 4: Run; verify PASS** — `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository.conformance.test.ts`
Expected: the **full `repositoryContract`** passes against the fake (fresh-meta stamping, revision bump, `REVISION_CONFLICT`, fresh-collide, foreign-meta-create, soft delete + idempotency, purge). This is the headline.

- [ ] **Step 5: Typecheck** — `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → clean.

- [ ] **Step 6: Commit**
```bash
git add packages/all-of-oyl/src/core/http-repository-contract.ts packages/all-of-oyl/src/core/http-repository.conformance.test.ts
git commit -m "feat(all-of-oyl): exported httpProtocolContract harness; HttpRepository passes the full contract"
```

---

### Task 4: Packaging — exports, build exclusion, protocol doc

**Files:** Modify `src/index.ts`, `tsconfig.build.json`; create `docs/oyl-sync-protocol-v1.md`.

- [ ] **Step 1: Export the adapter from the barrel**

In `packages/all-of-oyl/src/index.ts`, after the `LocalStorageRepository` export (line ~21) add:
```ts
export { createHttpClient, createHttpRepository, HttpRepositoryError, type RecordEnvelope, type HttpClient } from './core/http-repository.js'
```
(Do **not** export the fake or the contract harness from the barrel — they're test/dev utilities, imported directly from their modules.)

- [ ] **Step 2: Exclude the fake from the browser build**

In `packages/all-of-oyl/tsconfig.build.json`, extend `exclude`:
```json
  "exclude": ["./src/**/*.test.ts", "./src/**/*-contract.ts", "./src/**/*-fake.ts"]
```

- [ ] **Step 3: Write the protocol doc**

Create `docs/oyl-sync-protocol-v1.md` documenting (from the spec): auth (`Bearer`, server-derived owner), the record envelope, the 5 endpoints + the upsert/revision rule, the error table, and the protocol notes (unpaginated list; server should cap `data` size → `413`; reserved `Idempotency-Key`; OpenAPI is a future add). State that any backend passing `httpProtocolContract` is conformant.

- [ ] **Step 4: Full gate + build hygiene**

Run:
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run
pnpm --filter @oyl/all-of-oyl exec tsc --noEmit
pnpm all-of build
```
Expected: all tests pass; typecheck clean; **build succeeds with the bare-import guard passing**. Then verify the test/dev utilities did NOT leak into `dist/`:
```bash
ls packages/all-of-oyl/dist/core/ | grep -E 'http-repository' || true
```
Expected: `http-repository.js` present; **no** `http-repository-fake.js` or `http-repository-contract.js`.

- [ ] **Step 5: Commit**
```bash
git add packages/all-of-oyl/src/index.ts packages/all-of-oyl/tsconfig.build.json docs/oyl-sync-protocol-v1.md
git commit -m "feat(all-of-oyl): export HttpRepository; exclude fake from dist; document OYL sync protocol v1"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/all-of-oyl exec vitest run` — all green (incl. the full contract against the fake).
- [ ] `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` — clean.
- [ ] `pnpm all-of build` — succeeds; `dist/core/http-repository.js` exists; `http-repository-fake.js` / `http-repository-contract.js` do **not**.
- [ ] Nothing references `packages/strapi-oyl`. Deliverable: a contract-verified `HttpRepository`, an exported fake + `httpProtocolContract` harness, and `docs/oyl-sync-protocol-v1.md` — the machine-checkable spec for the SP2 backend.
