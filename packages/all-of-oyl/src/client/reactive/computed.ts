import { getActiveObserver, track, schedule, type Source } from './internals.js'

/**
 * A lazily-evaluated, cached derived value. Recomputes on read only when a source has
 * changed since the last computation; propagates invalidation to its own subscribers
 * (marking subscriber computeds stale and scheduling subscriber effects).
 */
export function computed<T>(fn: () => T, equals: (a: T, b: T) => boolean = Object.is): { get: () => T } {
  let value: T
  let stale = true
  const subs = new Set<any>()
  let sources = new Set<Source>()

  const node = {
    _addSource(src: Source) {
      sources.add(src)
    },
    // A source changed: become stale and propagate to our own subscribers.
    _markStale() {
      if (stale) return
      stale = true
      for (const sub of [...subs]) {
        if (typeof sub._markStale === 'function') sub._markStale()
        if (typeof sub._run === 'function') schedule(sub)
      }
    },
  }

  return {
    get() {
      const obs = getActiveObserver()
      if (obs) {
        subs.add(obs)
        obs._addSource({ _subs: subs })
      }
      if (stale) {
        for (const src of sources) src._subs.delete(node)
        sources = new Set()
        const next = track(node, fn)
        stale = false
        if (!equals(value, next)) value = next
      }
      return value
    },
  }
}
