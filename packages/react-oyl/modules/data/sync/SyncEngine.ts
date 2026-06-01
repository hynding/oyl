// packages/react-oyl/modules/data/sync/SyncEngine.ts
import { v4 as uuid } from 'uuid'
import type { RemoteClient } from '../useDataRemote'
import type { MirrorRecord, QueuedOp, SyncListener, SyncState } from './types'
import { readMirror, writeMirror, readQueue, writeQueue, wipeUser } from './storage'

type SaveOptions = { skipDrain?: boolean }

type Snapshot = {
  mirror: Record<string, MirrorRecord<unknown>>
  list: MirrorRecord<unknown>[]
}

const EMPTY_LIST: MirrorRecord<unknown>[] = Object.freeze([]) as MirrorRecord<unknown>[]

export class SyncEngine {
  private userId: string | null = null
  private online = true
  private listeners = new Map<string, Set<SyncListener>>()
  private lastSyncedAt: string | undefined
  private draining = false
  private remote: RemoteClient
  private snapshots = new Map<string, Snapshot>()

  constructor(remote: RemoteClient) {
    this.remote = remote
  }

  setUser(userId: string | null): void {
    this.userId = userId
    this.snapshots.clear()
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

  async refresh(path: string): Promise<void> {
    if (!this.userId) return
    try {
      const rows = await this.remote.findAll<{ id: string | number }>(path)
      const mirror: Record<string, MirrorRecord<unknown>> = {}
      for (const r of rows) mirror[String(r.id)] = r as MirrorRecord<unknown>
      // preserve pending rows
      const existing = readMirror(this.userId, path)
      for (const [k, v] of Object.entries(existing)) {
        if (v.__pendingOp) mirror[k] = v
      }
      writeMirror(this.userId, path, mirror)
      this.lastSyncedAt = new Date().toISOString()
      this.emit(path)
    } catch (err) {
      console.warn(`refresh(${path}) failed`, err)
    }
  }

  async refreshAll(paths: string[]): Promise<void> {
    await Promise.all(paths.map(p => this.refresh(p)))
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
        } catch (err) {
          console.warn(`drain op ${op.op} ${op.path} failed; rolling back`, err)
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
