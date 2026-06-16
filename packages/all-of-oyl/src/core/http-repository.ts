import { DomainError } from './domain-error.js'
import { metaFromJSON } from './persisted-meta.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'
import type { Codec } from '../collections.js' // Codec is defined in src/collections.ts; type-only import → erased, no runtime cycle

/** Minimal slice of the Fetch API needed by HttpClient; injected for testability. */
export interface FetchResponse {
  readonly status: number
  readonly ok: boolean
  json(): Promise<unknown>
}

/** Minimal fetch function signature; injected for testability and to avoid a DOM-lib dependency. */
export type FetchFn = (url: string, init?: Record<string, unknown>) => Promise<FetchResponse>

/** Minimal AbortSignal shape needed for timeout support. */
export interface AbortSignalLike {
  readonly aborted: boolean
}

/** Minimal AbortController shape needed for timeout support. */
export interface AbortControllerLike {
  readonly signal: AbortSignalLike
  abort(): void
}

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
  readonly status: number | undefined
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
  fetch: FetchFn
  getToken: () => Promise<string | undefined | null>
  /** Called before throwing on a 401 or 403; use to trigger logout or token refresh. */
  onAuthError?: () => void
  timeoutMs?: number
  /** Injectable AbortController factory; defaults to `() => new AbortController()` in runtimes that provide it. */
  newAbortController?: () => AbortControllerLike
  /** Injectable timer pair; defaults to the global `setTimeout`/`clearTimeout`. */
  timer?: {
    set(fn: () => void, ms: number): unknown
    clear(id: unknown): void
  }
}): HttpClient {
  const root = `${opts.baseUrl.replace(/\/$/, '')}/v1`
  return {
    async request(method, path, body) {
      const token = await opts.getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}` // R13
      const makeCtrl = opts.newAbortController
      const timers = opts.timer
      const ctrl = opts.timeoutMs !== undefined && makeCtrl !== undefined ? makeCtrl() : undefined // R14
      let timerId: unknown
      let clearTimer: ((id: unknown) => void) | undefined
      if (ctrl !== undefined && timers !== undefined && opts.timeoutMs !== undefined) {
        timerId = timers.set(() => ctrl.abort(), opts.timeoutMs)
        clearTimer = (id) => timers.clear(id)
      }
      let res: FetchResponse
      try {
        res = await opts.fetch(`${root}${path}`, {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          ...(ctrl !== undefined ? { signal: ctrl.signal } : {}),
        })
      } catch (err) {
        throw new HttpRepositoryError('transport', err instanceof Error ? err.message : String(err))
      } finally {
        if (clearTimer !== undefined) clearTimer(timerId)
      }
      if (res.status === 204 || res.status === 404) return undefined
      if (res.ok) return res.json()
      if (res.status === 409) {
        const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
        throw new DomainError('REVISION_CONFLICT', b?.error?.message ?? 'revision conflict')
      }
      if (res.status === 401 || res.status === 403) {
        opts.onAuthError?.()
        throw new HttpRepositoryError('auth', `unauthorized (${res.status})`, res.status)
      }
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
      const params: string[] = []
      if (opts?.includeDeleted) params.push('includeDeleted=1')
      if (opts?.since) params.push(`since=${encodeURIComponent(opts.since)}`)
      const res = (await client.request('GET', `${base}${params.length ? '?' + params.join('&') : ''}`)) as { records: RecordEnvelope[] }
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
