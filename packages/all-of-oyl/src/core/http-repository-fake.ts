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
