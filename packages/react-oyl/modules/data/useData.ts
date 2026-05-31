// packages/react-oyl/modules/data/useData.ts
import { useCallback } from 'react'
import { syncEngine } from './sync/instance'
import { useSyncedList, useSyncedOne, useSyncState } from './sync/useSync'
import type { SyncState } from './sync/types'

export type UseDataResult<T> = {
  find: () => T[]
  get: (id: string | number) => T | undefined
  save: (record: Partial<T>) => Promise<void>
  update: (id: string | number, patch: Partial<T>) => Promise<void>
  remove: (id: string | number) => Promise<void>
  refresh: () => Promise<void>
  syncState: SyncState
}

export function useData<T extends object>(path: string): UseDataResult<T> {
  const list = useSyncedList<T>(path)
  const syncState = useSyncState()
  const find = useCallback(() => list, [list])
  const get = useCallback((id: string | number) => list.find((r): r is T => (r as { id: unknown }).id === id || String((r as { id: unknown }).id) === String(id)), [list])
  const save = useCallback((record: Partial<T>) => syncEngine.save(path, record as object), [path])
  const update = useCallback((id: string | number, patch: Partial<T>) => syncEngine.update(path, id, patch), [path])
  const remove = useCallback((id: string | number) => syncEngine.remove(path, id), [path])
  const refresh = useCallback(() => syncEngine.refresh(path), [path])
  return { find, get, save, update, remove, refresh, syncState }
}

export function useDataOne<T extends object>(path: string, id: string | number | undefined): T | undefined {
  return useSyncedOne<T>(path, id)
}
