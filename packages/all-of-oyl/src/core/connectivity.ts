/** Online/offline signal, injected so the engine never touches navigator/window. */
export interface Connectivity {
  isOnline(): boolean
  subscribe(cb: (online: boolean) => void): () => void
}

export function alwaysOnline(): Connectivity {
  return { isOnline: () => true, subscribe: () => () => {} }
}

export function alwaysOffline(): Connectivity {
  return { isOnline: () => false, subscribe: () => () => {} }
}

export function manualConnectivity(initial = true): Connectivity & { setOnline(v: boolean): void } {
  let online = initial
  const subs = new Set<(o: boolean) => void>()
  return {
    isOnline: () => online,
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    setOnline(v) {
      online = v
      for (const cb of subs) cb(v)
    },
  }
}
