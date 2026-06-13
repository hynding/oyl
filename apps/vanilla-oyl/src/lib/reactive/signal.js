import { getActiveObserver, schedule } from './internals.js'

/**
 * @template T
 * @typedef {object} Signal
 * @property {() => T} get  Read the value; auto-tracks if called inside an effect/computed.
 * @property {(value: T) => void} set  Write the value; notifies dependents if changed.
 */

/**
 * Create a writable reactive value.
 * @template T
 * @param {T} initial
 * @param {(a: T, b: T) => boolean} [equals]  defaults to Object.is
 * @returns {Signal<T>}
 */
export function signal(initial, equals = Object.is) {
  let value = initial
  /** @type {Set<any>} */
  const subs = new Set()

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
