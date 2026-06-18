import type { StorageLike } from './local-storage-repository.js'

export type Mutation = {
  id: string
  entity: string
  op: 'save' | 'delete'
  payload: unknown
  baseUpdatedAt: string | null
  enqueuedAt: string
}

export interface WriteOutbox {
  enqueue(m: Omit<Mutation, 'id' | 'enqueuedAt'>): Mutation
  peekAll(): Mutation[]
  ack(id: string): void
  size(): number
}

export function createWriteOutbox(
  storage: StorageLike,
  key: string,
  now: () => Date,
  newId: () => string,
  /** Invoked after each enqueue (e.g. to trigger a same-tab flush). */
  onEnqueue?: () => void,
): WriteOutbox {
  function read(): Mutation[] {
    const raw = storage.getItem(key)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as Mutation[]) : []
    } catch {
      return []
    }
  }

  function write(entries: Mutation[]): void {
    storage.setItem(key, JSON.stringify(entries))
  }

  return {
    enqueue(m) {
      const entries = read()
      const mutation: Mutation = { id: newId(), enqueuedAt: now().toISOString(), ...m }
      entries.push(mutation)
      write(entries)
      onEnqueue?.()
      return mutation
    },
    peekAll() {
      return read()
    },
    ack(id) {
      const entries = read()
      const next = entries.filter((e) => e.id !== id)
      if (next.length !== entries.length) write(next)
    },
    size() {
      return read().length
    },
  }
}
