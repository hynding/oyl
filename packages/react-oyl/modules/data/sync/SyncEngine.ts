// packages/react-oyl/modules/data/sync/SyncEngine.ts
import { v4 as uuid } from 'uuid'
import type { RemoteClient } from '../useDataRemote'
import type { MirrorRecord, QueuedOp, SyncError, SyncListener, SyncState } from './types'
import { readMirror, writeMirror, readQueue, writeQueue, wipeUser } from './storage'

type SaveOptions = { skipDrain?: boolean }

type Snapshot = {
  mirror: Record<string, MirrorRecord<unknown>>
  list: MirrorRecord<unknown>[]
}

const EMPTY_LIST = Object.freeze([] as MirrorRecord<unknown>[])

export class SyncEngine {
  private userId: string | null = null
  private online = true
  private listeners = new Map<string, Set<SyncListener>>()
  private lastSyncedAt: string | undefined
  private lastSyncedAtByPath = new Map<string, string>()
  private lastError: SyncError | undefined
  private draining = false
  private remote: RemoteClient
  private snapshots = new Map<string, Snapshot>()
  // In-flight refresh promises, keyed by path (for refresh) or by `agg:<date>`
  // (for refreshAggregate). Concurrent callers — most often React StrictMode's
  // double-mounted effects — share the existing promise instead of firing a
  // second HTTP request.
  private inflight = new Map<string, Promise<void>>()

  constructor(remote: RemoteClient) {
    this.remote = remote
  }

  setUser(userId: string | null): void {
    this.userId = userId
    this.snapshots.clear()
    this.lastSyncedAtByPath.clear()
    this.lastSyncedAt = undefined
    this.inflight.clear()
    this.emitAll()
  }

  setOnline(online: boolean): void {
    const transitioned = !this.online && online
    this.online = online
    if (transitioned && this.userId) {
      this.drain().catch(() => {})
    }
  }

  state(): SyncState {
    return {
      pendingCount: this.userId ? readQueue(this.userId).length : 0,
      lastSyncedAt: this.lastSyncedAt,
      lastSyncedAtByPath: Object.fromEntries(this.lastSyncedAtByPath),
      lastError: this.lastError,
      online: this.online,
    }
  }

  readAll<T>(path: string): MirrorRecord<T>[] {
    if (!this.userId) return EMPTY_LIST as MirrorRecord<T>[]
    return this.getSnapshot(path).list as MirrorRecord<T>[]
  }

  readOne<T>(path: string, id: string | number): MirrorRecord<T> | undefined {
    if (!this.userId) return undefined
    return this.getSnapshot(path).mirror[String(id)] as MirrorRecord<T> | undefined
  }

  private getSnapshot(path: string): Snapshot {
    const cached = this.snapshots.get(path)
    if (cached) return cached
    const mirror = readMirror(this.userId!, path)
    const snap: Snapshot = { mirror, list: Object.values(mirror) }
    this.snapshots.set(path, snap)
    return snap
  }

  subscribe(path: string, cb: SyncListener): () => void {
    if (!this.listeners.has(path)) this.listeners.set(path, new Set())
    this.listeners.get(path)!.add(cb)
    return () => this.listeners.get(path)?.delete(cb)
  }

  async save<T extends object>(path: string, body: T, opts: SaveOptions = {}): Promise<void> {
    if (!this.userId) throw new Error('SyncEngine: no user set')
    const tempId = `local-${uuid()}`
    const mirror = readMirror<T>(this.userId, path)
    mirror[tempId] = { ...(body as object), id: tempId, __pendingOp: 'create' } as MirrorRecord<T>
    writeMirror(this.userId, path, mirror)

    const op: QueuedOp = { id: uuid(), op: 'create', path, tempId, body, createdAt: Date.now() }
    const queue = readQueue(this.userId)
    writeQueue(this.userId, [...queue, op])

    this.emit(path)
    if (this.online && !opts.skipDrain) await this.drain()
  }

  async update<T extends object>(path: string, id: string | number, patch: Partial<T>, opts: SaveOptions = {}): Promise<void> {
    if (!this.userId) throw new Error('SyncEngine: no user set')
    const mirror = readMirror<T>(this.userId, path)
    const existing = mirror[String(id)]
    if (!existing) throw new Error(`SyncEngine.update: ${path}/${id} not in mirror`)
    mirror[String(id)] = { ...existing, ...patch, __pendingOp: 'update' } as MirrorRecord<T>
    writeMirror(this.userId, path, mirror)

    const op: QueuedOp = { id: uuid(), op: 'update', path, recordId: id, body: patch, createdAt: Date.now() }
    writeQueue(this.userId, [...readQueue(this.userId), op])

    this.emit(path)
    if (this.online && !opts.skipDrain) await this.drain()
  }

  async remove(path: string, id: string | number, opts: SaveOptions = {}): Promise<void> {
    if (!this.userId) throw new Error('SyncEngine: no user set')
    const mirror = readMirror(this.userId, path)
    delete mirror[String(id)]
    writeMirror(this.userId, path, mirror)

    const op: QueuedOp = { id: uuid(), op: 'delete', path, recordId: id, createdAt: Date.now() }
    writeQueue(this.userId, [...readQueue(this.userId), op])

    this.emit(path)
    if (this.online && !opts.skipDrain) await this.drain()
  }

  async refresh(path: string, opts: { maxAgeMs?: number } = {}): Promise<void> {
    if (!this.userId) return
    if (opts.maxAgeMs != null) {
      const last = this.lastSyncedAtByPath.get(path)
      if (last && Date.now() - Date.parse(last) < opts.maxAgeMs) return
    }
    const existingInflight = this.inflight.get(path)
    if (existingInflight) return existingInflight
    const userId = this.userId
    const work = (async () => {
      try {
        const rows = await this.remote.findAll<{ id: string | number }>(path)
        const mirror: Record<string, MirrorRecord<unknown>> = {}
        for (const r of rows) mirror[String(r.id)] = r as MirrorRecord<unknown>
        // preserve pending rows
        const existing = readMirror(userId, path)
        for (const [k, v] of Object.entries(existing)) {
          if (v.__pendingOp) mirror[k] = v
        }
        writeMirror(userId, path, mirror)
        const now = new Date().toISOString()
        this.lastSyncedAt = now
        this.lastSyncedAtByPath.set(path, now)
        this.emit(path)
      } catch (err) {
        console.warn(`refresh(${path}) failed`, err)
      } finally {
        this.inflight.delete(path)
      }
    })()
    this.inflight.set(path, work)
    return work
  }

  async refreshAll(paths: string[], opts: { maxAgeMs?: number } = {}): Promise<void> {
    await Promise.all(paths.map(p => this.refresh(p, opts)))
  }

  // Write a pre-fetched row set into the path's mirror, preserving any pending
  // ops. No HTTP — callers (like refreshAggregate) own the fetch. Marks the
  // path fresh so subsequent maxAgeMs-bounded refreshes can short-circuit.
  seed(path: string, rows: Array<{ id: string | number }>): void {
    if (!this.userId) return
    const mirror: Record<string, MirrorRecord<unknown>> = {}
    for (const r of rows) mirror[String(r.id)] = r as MirrorRecord<unknown>
    const existing = readMirror(this.userId, path)
    for (const [k, v] of Object.entries(existing)) {
      if (v.__pendingOp) mirror[k] = v
    }
    writeMirror(this.userId, path, mirror)
    const now = new Date().toISOString()
    this.lastSyncedAt = now
    this.lastSyncedAtByPath.set(path, now)
    this.emit(path)
  }

  // One HTTP call seeds every mirror path the aggregate covers. Used by
  // SyncBootstrap to collapse the initial daily-page request burst.
  async refreshAggregate(date: string): Promise<void> {
    if (!this.userId) return
    const key = `agg:${date}`
    const existingInflight = this.inflight.get(key)
    if (existingInflight) return existingInflight
    const work = (async () => {
      try {
        const payload = await this.remote.findAggregate(date)
        for (const [path, rows] of Object.entries(payload.paths)) {
          this.seed(path, rows)
        }
      } catch (err) {
        console.warn(`refreshAggregate(${date}) failed`, err)
      } finally {
        this.inflight.delete(key)
      }
    })()
    this.inflight.set(key, work)
    return work
  }

  async drain(): Promise<void> {
    if (this.draining) return
    if (!this.userId || !this.online) return
    this.draining = true
    const userId = this.userId
    try {
      let queue = readQueue(userId)
      while (queue.length > 0) {
        const op = queue[0]
        try {
          if (op.op === 'create') {
            const created = await this.remote.create<{ id: string | number }>(op.path, op.body)
            // swap tempId in mirror
            const mirror = readMirror(userId, op.path)
            delete mirror[op.tempId]
            mirror[String(created.id)] = { ...(created as object), id: created.id } as MirrorRecord<unknown>
            writeMirror(userId, op.path, mirror)
            this.emit(op.path)
          } else if (op.op === 'update') {
            await this.remote.update(op.path, op.recordId, op.body)
            const mirror = readMirror(userId, op.path)
            const row = mirror[String(op.recordId)]
            if (row) {
              const stripped: MirrorRecord<unknown> = { ...row }
              delete stripped.__pendingOp
              mirror[String(op.recordId)] = stripped
              writeMirror(userId, op.path, mirror)
            }
            this.emit(op.path)
          } else if (op.op === 'delete') {
            await this.remote.remove(op.path, op.recordId)
            this.emit(op.path)
          }
          this.lastError = undefined
        } catch (err) {
          console.warn(`drain op ${op.op} ${op.path} failed; rolling back`, err)
          this.lastError = {
            op: op.op,
            path: op.path,
            message: err instanceof Error ? err.message : String(err),
            at: new Date().toISOString(),
          }
          if (op.op === 'create') {
            const mirror = readMirror(userId, op.path)
            delete mirror[op.tempId]
            writeMirror(userId, op.path, mirror)
            this.emit(op.path)
          }
          // drop the failing op to unblock the queue
        }
        queue = readQueue(userId).slice(1)
        writeQueue(userId, queue)
      }
    } finally {
      this.draining = false
    }
  }

  wipe(): void {
    if (this.userId === null) throw new Error('SyncEngine.wipe(): no user set')
    wipeUser(this.userId)
    this.snapshots.clear()
    this.listeners.clear()
  }

  private emit(path: string): void {
    this.snapshots.delete(path)
    this.listeners.get(path)?.forEach(cb => cb())
  }

  private emitAll(): void {
    this.snapshots.clear()
    for (const set of this.listeners.values()) set.forEach(cb => cb())
  }
}
