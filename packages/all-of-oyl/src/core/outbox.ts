import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { StorageLike } from './local-storage-repository.js'

export type OutboxOp = 'save' | 'delete' | 'purge'
export interface OutboxEntry { seq: number; collection: string; op: OutboxOp; id: string; enqueuedAt: string }

export interface Outbox {
  /** Coalesces per (collection,id): replaces any prior entry; assigns a fresh monotonic seq. */
  enqueue(collection: string, op: OutboxOp, id: Id): OutboxEntry
  /** FIFO snapshot. */
  list(): OutboxEntry[]
  /** Compare-and-remove: drop the entry only if the current seq matches (protects a concurrent re-enqueue). */
  removeIfSeq(collection: string, id: Id, seq: number): void
  has(collection: string, id: Id): boolean
  size(): number
}

export function createOutbox(storage: StorageLike, key: string, now: () => Date): Outbox {
  function read(): OutboxEntry[] {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new DomainError('MALFORMED_JSON', `${key} is not an array`)
    return parsed as OutboxEntry[]
  }
  function write(entries: OutboxEntry[]): void {
    storage.setItem(key, JSON.stringify(entries))
  }
  let seqCounter = read().reduce((m, e) => Math.max(m, e.seq), 0)
  return {
    enqueue(collection, op, id) {
      const sid = String(id)
      const entries = read().filter((e) => !(e.collection === collection && e.id === sid))
      const entry: OutboxEntry = { seq: ++seqCounter, collection, op, id: sid, enqueuedAt: now().toISOString() }
      entries.push(entry)
      write(entries)
      return entry
    },
    list() {
      return read()
    },
    removeIfSeq(collection, id, seq) {
      const sid = String(id)
      const entries = read()
      const next = entries.filter((e) => !(e.collection === collection && e.id === sid && e.seq === seq))
      if (next.length !== entries.length) write(next)
    },
    has(collection, id) {
      const sid = String(id)
      return read().some((e) => e.collection === collection && e.id === sid)
    },
    size() {
      return read().length
    },
  }
}
