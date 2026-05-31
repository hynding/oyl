// packages/react-oyl/modules/data/sync/storage.ts
import type { MirrorRecord, QueuedOp } from './types'

const NAMESPACE = 'oyl'

export const mirrorKey = (userId: string, path: string) =>
  `${NAMESPACE}:${userId}:${path}`

export const queueKey = (userId: string) =>
  `${NAMESPACE}:${userId}:__sync_queue__`

export function readMirror<T>(userId: string, path: string): Record<string, MirrorRecord<T>> {
  const raw = localStorage.getItem(mirrorKey(userId, path))
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export function writeMirror<T>(userId: string, path: string, value: Record<string, MirrorRecord<T>>): void {
  localStorage.setItem(mirrorKey(userId, path), JSON.stringify(value))
}

export function readQueue(userId: string): QueuedOp[] {
  const raw = localStorage.getItem(queueKey(userId))
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export function writeQueue(userId: string, ops: QueuedOp[]): void {
  localStorage.setItem(queueKey(userId), JSON.stringify(ops))
}

export function wipeUser(userId: string): void {
  const prefix = `${NAMESPACE}:${userId}:`
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(prefix)) toRemove.push(k)
  }
  toRemove.forEach(k => localStorage.removeItem(k))
}
