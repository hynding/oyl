import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'
import type { CacheStore } from './cache-store.js'
import type { Outbox } from './outbox.js'
import type { Connectivity } from './connectivity.js'
import type { CursorStore } from './cursor-store.js'

export interface SyncState {
  online: boolean
  pending: number
  status: 'idle' | 'syncing' | 'offline' | 'error'
  lastError?: string
  lastSyncedAt?: Date
  pulledAt?: Date
  conflicts: number
  lastConflict?: { collection: string; id: string; at: Date }
  failed: number
  lastFailedError?: string
}

export interface Observable<T> {
  get(): T
  subscribe(cb: (v: T) => void): () => void
}

export interface Lock {
  /** Run fn while holding the named lock; serialize (queue) across concurrent holders. */
  runExclusive(name: string, fn: () => Promise<void>): Promise<void>
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
  resync(): Promise<void>
  retryFailed(): Promise<void>
  discardFailed(): void
}

export function createSyncEngine(deps: {
  collections: Record<string, { cache: CacheStore<any>; remote: Repository<any> }>
  outbox: Outbox
  connectivity: Connectivity
  now: () => Date
  timers?: Timers
  backoff?: (attempt: number) => number
  conflictPolicy?: 'client-wins' | 'server-wins'
  lock?: Lock
  cursors?: CursorStore
}): SyncEngine {
  const { collections, outbox, connectivity, now, timers, cursors, lock } = deps
  const backoff = deps.backoff ?? ((a) => Math.min(30_000, 1_000 * 2 ** a))
  const policy = deps.conflictPolicy ?? 'client-wins'
  const MAX_CONFLICT_RETRIES = 3

  const countPending = () => outbox.list().filter((e) => !e.failedAt).length
  const countFailed = () => outbox.list().filter((e) => e.failedAt).length
  let state: SyncState = { online: connectivity.isOnline(), pending: countPending(), status: 'idle', conflicts: 0, failed: countFailed() }
  const subs = new Set<(v: SyncState) => void>()
  function emit(patch: Partial<SyncState>): void {
    state = { ...state, ...patch, pending: countPending(), failed: countFailed(), online: connectivity.isOnline() }
    for (const cb of subs) cb(state)
  }
  const syncState: Observable<SyncState> = {
    get: () => state,
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb) },
  }

  function recordConflict(collection: string, id: Id): void {
    emit({ conflicts: state.conflicts + 1, lastConflict: { collection, id: String(id), at: now() } })
  }

  function isConflict(e: unknown): boolean {
    return e instanceof DomainError && e.code === 'REVISION_CONFLICT'
  }
  function classify(e: unknown): 'auth' | 'transport' | 'poison' {
    const x = e as { name?: string; kind?: string; status?: number }
    if (x?.name === 'HttpRepositoryError') {
      if (x.kind === 'auth') return 'auth'
      if (typeof x.status === 'number' && x.status >= 400 && x.status < 500) return 'poison'
      return 'transport'
    }
    return 'poison'
  }
  function notFound(e: unknown): boolean {
    const x = e as { name?: string; status?: number }
    return x?.name === 'HttpRepositoryError' && x.status === 404
  }
  function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  async function advanceBaseRevision(cache: CacheStore<any>, id: Id, saved: Rec): Promise<void> {
    const current = (await cache.getRaw(id)) as Rec | undefined
    if (current?.meta && saved?.meta) {
      current.meta = { ...current.meta, revision: saved.meta.revision }
      await cache.putRaw(current)
    }
  }

  /** Deleted-inclusive read: get hides tombstones, so fall back to list. undefined = hard-purged. */
  async function currentServerRecord(remote: Repository<any>, id: Id): Promise<Rec | undefined> {
    const got = (await remote.get(id)) as Rec | undefined
    if (got) return got
    const all = (await remote.list({ includeDeleted: true })) as Rec[]
    return all.find((r) => r.id === id)
  }

  /** Apply the conflict policy to a flush save conflict. Returns true if resolved (op may be removed). */
  async function resolveConflict(
    coll: { cache: CacheStore<any>; remote: Repository<any> },
    collection: string,
    id: Id,
    localRec: Rec,
  ): Promise<boolean> {
    for (let i = 0; i < MAX_CONFLICT_RETRIES; i++) {
      const cur = await currentServerRecord(coll.remote, id)
      if (policy === 'server-wins') {
        if (cur) await coll.cache.putRaw(cur)
        else await coll.cache.removeRaw(id)
        recordConflict(collection, id)
        return true
      }
      // client-wins: re-push local data over the current revision (cur undefined -> server re-creates)
      if (cur?.meta && localRec.meta) localRec.meta = { ...localRec.meta, revision: cur.meta.revision }
      try {
        const saved = (await coll.remote.save(localRec)) as Rec
        await advanceBaseRevision(coll.cache, id, saved)
        recordConflict(collection, id)
        return true
      } catch (e) {
        if (!isConflict(e)) throw e
      }
    }
    return false
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
    currentFlush = (lock ? lock.runExclusive('oyl-flush', doFlush) : doFlush()).finally(() => { currentFlush = undefined })
    return currentFlush
  }

  async function doFlush(): Promise<void> {
    if (!connectivity.isOnline()) { emit({ status: 'offline' }); return }
    emit({ status: 'syncing' })
    try {
      let entries = outbox.list().filter((e) => !e.failedAt)
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
              try {
                const saved = (await remote.save(rec)) as Rec
                await advanceBaseRevision(cache, id, saved)
              } catch (e) {
                if (!isConflict(e)) throw e
                const resolved = await resolveConflict(coll, entry.collection, id, rec)
                if (!resolved) { scheduleRetry(); emit({ status: 'offline' }); return }
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
            const kind = classify(e)
            if (kind === 'auth') { emit({ status: 'error', lastError: message(e) }); return }
            if (kind === 'transport') { scheduleRetry(); emit({ status: 'offline' }); return }
            outbox.markFailed(entry.collection, id, message(e)); emit({ lastFailedError: message(e) })
          }
          emit({})
        }
        entries = outbox.list().filter((e) => !e.failedAt)
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
      const since = cursors?.get(name)
      let serverRecs: Rec[]
      try {
        serverRecs = (await remote.list(since ? { includeDeleted: true, since } : { includeDeleted: true })) as Rec[]
      } catch (e) {
        if (classify(e) === 'transport') { emit({ status: 'offline' }); return }
        throw e
      }
      let max = since
      for (const rec of serverRecs) {
        if (!outbox.has(name, rec.id)) await cache.putRaw(rec)
        const u = rec.meta?.updatedAt?.toISOString()
        if (u && (!max || u >= max)) max = u
      }
      if (cursors && max) cursors.set(name, max)
    }
    emit({ lastSyncedAt: now(), pulledAt: now() })
  }

  async function resync(): Promise<void> {
    cursors?.clear()
    await pull()
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

  async function retryFailed(): Promise<void> { outbox.clearFailed(); await flush() }
  function discardFailed(): void { outbox.discardFailed(); emit({}) }

  return { repositories, syncState, start, flush, pull, resync, retryFailed, discardFailed }
}
