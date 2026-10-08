import { getActiveObserver, schedule } from './internals.js'

export interface Signal<T> {
  /** Read the value; auto-tracks if called inside an effect/computed. */
  get(): T
  /** Write the value; notifies dependents if changed. */
  set(value: T): void
}

/** Create a writable reactive value. `equals` defaults to Object.is. */
export function signal<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Signal<T> {
  let value = initial
  const subs = new Set<any>()
  return {
    get() {
      const obs = getActiveObserver()
      if (obs) {
        subs.add(obs)
        obs._addSource({ _subs: subs })
      }
      return value
    },
    set(next) {
      if (equals(value, next)) return
      value = next
      // Cycle detection: a write to a signal that the currently-running observer
      // also reads is a cycle. Throw synchronously before scheduling.
      const active = getActiveObserver()
      for (const sub of [...subs]) {
        if (sub === active) {
          throw new Error('reactive: cycle detected (effect wrote a signal it reads)')
        }
        if (typeof sub._markStale === 'function') sub._markStale()
        if (typeof sub._run === 'function') schedule(sub)
      }
    },
  }
}
