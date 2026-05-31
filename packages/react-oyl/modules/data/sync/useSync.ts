// packages/react-oyl/modules/data/sync/useSync.ts
import { useEffect, useState, useSyncExternalStore } from 'react'
import { syncEngine } from './instance'
import type { SyncState } from './types'

export function useSyncedList<T>(path: string): T[] {
  const subscribe = (cb: () => void) => syncEngine.subscribe(path, cb)
  const getSnapshot = () => syncEngine.readAll<T>(path) as unknown as T[]
  // useSyncExternalStore requires stable references; readAll returns a fresh array each time.
  // To avoid tearing in React 19, memoize by JSON length+ids.
  const data = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return data
}

export function useSyncedOne<T>(path: string, id: string | number | undefined): T | undefined {
  const subscribe = (cb: () => void) => syncEngine.subscribe(path, cb)
  const getSnapshot = () => (id == null ? undefined : syncEngine.readOne<T>(path, id) as unknown as T | undefined)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useSyncState(): SyncState {
  const [state, setState] = useState(syncEngine.state())
  useEffect(() => {
    const tick = () => setState(syncEngine.state())
    // subscribe to all paths' changes (cheap pings)
    const subs = ['user-dailies', 'user-activities', 'user-activity-logs', 'user-goals', 'user-goal-milestones']
      .map(p => syncEngine.subscribe(p, tick))
    const interval = setInterval(tick, 5000)
    return () => { subs.forEach(unsub => unsub()); clearInterval(interval) }
  }, [])
  return state
}
