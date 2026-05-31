import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { syncEngine } from './instance'
import type { SyncState } from './types'

export function useSyncedList<T>(path: string): T[] {
  const subscribe = useCallback((cb: () => void) => syncEngine.subscribe(path, cb), [path])
  const getSnapshot = useCallback(() => syncEngine.readAll<T>(path) as unknown as T[], [path])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useSyncedOne<T>(path: string, id: string | number | undefined): T | undefined {
  const subscribe = useCallback((cb: () => void) => syncEngine.subscribe(path, cb), [path])
  const getSnapshot = useCallback(
    () => (id == null ? undefined : (syncEngine.readOne<T>(path, id) as unknown as T | undefined)),
    [path, id],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useSyncState(): SyncState {
  const [state, setState] = useState(syncEngine.state())
  useEffect(() => {
    const tick = () => setState(syncEngine.state())
    const subs = ['user-dailies', 'user-activities', 'user-activity-logs', 'user-goals', 'user-goal-milestones']
      .map(p => syncEngine.subscribe(p, tick))
    const interval = setInterval(tick, 5000)
    return () => { subs.forEach(unsub => unsub()); clearInterval(interval) }
  }, [])
  return state
}
