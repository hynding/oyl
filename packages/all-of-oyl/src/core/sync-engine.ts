import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'
import type { CacheStore } from './cache-store.js'
import type { Outbox } from './outbox.js'
import type { Connectivity } from './connectivity.js'

export interface SyncState {
  online: boolean
  pending: number
  status: 'idle' | 'syncing' | 'offline' | 'error'
  lastError?: string
  lastSyncedAt?: Date
}

export interface Observable<T> {
  get(): T
  subscribe(cb: (v: T) => void): () => void
}

interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

type Rec = { id: Id; meta?: PersistedMeta }

export interface SyncEngine {
  repositories: Record<string, Repository<any>>
  syncState: Observable<SyncState>
  start(): Promise<void>
  flush(): Promise<void>
  pull(): Promise<void>
}

export function createSyncEngine(deps: {
  collections: Record<string, { cache: CacheStore<any>; remote: Repository<any> }>
  outbox: Outbox
  connectivity: Connectivity
  now: () => Date
  timers?: Timers
  backoff?: (attempt: number) => number
}): SyncEngine {
  const { collections, outbox, connectivity, now, timers } = deps
  const backoff = deps.backoff ?? ((a) => Math.min(30_000, 1_000 * 2 ** a))

  let state: SyncState = { online: connectivity.isOnline(), pending: outbox.size(), status: 'idle' }
  const subs = new Set<(v: SyncState) => void>()
  function emit(patch: Partial<SyncState>): void {
    state = { ...state, ...patch, pending: outbox.size(), online: connectivity.isOnline() }
    for (const cb of subs) cb(state)
  }
  const syncState: Observable<SyncState> = {
    get: () => state,
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb) },
  }

  function isConflict(e: unknown): boolean {
    return e instanceof DomainError && e.code === 'REVISION_CONFLICT'
  }
  function errKind(e: unknown): 'auth' | 'transport' | 'other' {
    const x = e as { name?: string; kind?: string }
    if (x?.name === 'HttpRepositoryError') return x.kind === 'auth' ? 'auth' : 'transport'
    return 'other'
  }
  function notFound(e: unknown): boolean {
    const x = e as { name?: string; status?: number }
    return x?.name === 'HttpRepositoryError' && x.status === 404
  }
  function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  let currentFlush: Promise<void> | undefined = undefined
  let attempt = 0
  let retry: unknown = undefined
  function scheduleRetry(): void {
    if (!timers) return
    if (retry !== undefined) timers.clear(retry)
    retry = timers.set(() => { retry = undefined; void flush() }, backoff(attempt++))
  }

  function flush(): Promise<void> {
    if (currentFlush) return currentFlush
    if (!connectivity.isOnline()) { emit({ status: 'offline' }); return Promise.resolve() }
    currentFlush = doFlush().finally(() => { currentFlush = undefined })
    return currentFlush
  }

  async function doFlush(): Promise<void> {
    emit({ status: 'syncing' })
    try {
      let entries = outbox.list()
      while (entries.length > 0) {
        for (const entry of entries) {
          const coll = collections[entry.collection]
          if (!coll) { outbox.removeIfSeq(entry.collection, entry.id as unknown as Id, entry.seq); continue }
          const { cache, remote } = coll
          const id = entry.id as unknown as Id
          try {
            if (entry.op === 'save') {
              const rec = (await cache.getRaw(id)) as Rec | undefined
              if (!rec) { outbox.removeIfSeq(entry.collection, id, entry.seq); continue }
              let saved: Rec
              try {
                saved = await remote.save(rec)
              } catch (e) {
                if (isConflict(e)) {
                  const cur = (await remote.get(id)) as Rec | undefined
                  if (cur?.meta && rec.meta) rec.meta = { ...rec.meta, revision: cur.meta.revision }
                  saved = await remote.save(rec)
                } else throw e
              }
              const current = (await cache.getRaw(id)) as Rec | undefined
              if (current?.meta && saved?.meta) {
                current.meta = { ...current.meta, revision: saved.meta.revision }
                await cache.putRaw(current)
              }
              outbox.removeIfSeq(entry.collection, id, entry.seq)
            } else if (entry.op === 'delete') {
              try { await remote.delete(id) } catch (e) { if (!notFound(e)) throw e }
              outbox.removeIfSeq(entry.collection, id, entry.seq)
            } else {
              try { await remote.purge(id) } catch (e) { if (!notFound(e)) throw e }
              outbox.removeIfSeq(entry.collection, id, entry.seq)
            }
          } catch (e) {
            const kind = errKind(e)
            if (kind === 'auth') { emit({ status: 'error', lastError: message(e) }); return }
            if (kind === 'transport') { scheduleRetry(); emit({ status: 'offline' }); return }
            emit({ status: 'error', lastError: message(e) }); return
          }
          emit({})
        }
        entries = outbox.list()
      }
      attempt = 0
      emit({ status: 'idle', lastSyncedAt: now() })
    } catch (_) {
      // rethrow handled in finally via currentFlush
      throw _
    }
  }

  async function pull(): Promise<void> {
    if (!connectivity.isOnline()) return
    for (const name of Object.keys(collections)) {
      const { cache, remote } = collections[name]!
      let serverRecs: Rec[]
      try {
        serverRecs = (await remote.list({ includeDeleted: true })) as Rec[]
      } catch (e) {
        if (errKind(e) === 'transport') { emit({ status: 'offline' }); return }
        throw e
      }
      for (const rec of serverRecs) {
        if (outbox.has(name, rec.id)) continue
        await cache.putRaw(rec)
      }
    }
    emit({ lastSyncedAt: now() })
  }

  function makeFacade(name: string, cache: CacheStore<any>): Repository<any> {
    const trigger = () => { void flush() }
    return {
      get: (id) => cache.get(id),
      list: (opts) => cache.list(opts),
      async save(item: Rec) {
        const existing = (await cache.getRaw(item.id)) as Rec | undefined
        const at = now()
        item.meta = existing?.meta
          ? { createdAt: existing.meta.createdAt, updatedAt: at, revision: existing.meta.revision }
          : { createdAt: at, updatedAt: at, revision: 1 }
        await cache.putRaw(item)
        outbox.enqueue(name, 'save', item.id)
        emit({})
        trigger()
        return item
      },
      async delete(id) {
        const existing = (await cache.getRaw(id)) as Rec | undefined
        if (existing?.meta && !existing.meta.deletedAt) {
          existing.meta = { ...existing.meta, updatedAt: now(), deletedAt: now() }
          await cache.putRaw(existing)
        }
        outbox.enqueue(name, 'delete', id)
        emit({})
        trigger()
      },
      async purge(id) {
        await cache.removeRaw(id)
        outbox.enqueue(name, 'purge', id)
        emit({})
        trigger()
      },
      async saveMany(items: Rec[]) {
        const out: Rec[] = []
        for (const item of items) out.push(await this.save(item))
        return out
      },
    }
  }

  const repositories: Record<string, Repository<any>> = {}
  for (const name of Object.keys(collections)) {
    repositories[name] = makeFacade(name, collections[name]!.cache)
  }

  async function start(): Promise<void> {
    connectivity.subscribe((online) => {
      emit({ online })
      if (online) void flush().then(() => pull())
    })
    if (connectivity.isOnline()) {
      await flush()
      await pull()
    } else {
      emit({ status: 'offline' })
    }
  }

  return { repositories, syncState, start, flush, pull }
}
