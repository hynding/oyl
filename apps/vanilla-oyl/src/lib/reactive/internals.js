/**
 * Shared reactive runtime: the active-observer stack (autotracking) and the microtask
 * effect scheduler. Kept in one module so signal/computed/effect share one graph.
 * @typedef {{ _addSource(src: { _subs: Set<object> }): void }} Observer
 */

/** @type {any} */
let activeObserver = null
/** @type {Set<{ _run(): void }>} */
const pending = new Set()
let scheduled = false
let flushing = false

/** @returns {any} */
export function getActiveObserver() {
  return activeObserver
}

/**
 * Run `fn` with `observer` as the active tracking target, restoring the previous one.
 * @template T @param {any} observer @param {() => T} fn @returns {T}
 */
export function track(observer, fn) {
  const prev = activeObserver
  activeObserver = observer
  try {
    return fn()
  } finally {
    activeObserver = prev
  }
}

/** Queue an effect to run on the next microtask batch. @param {{ _run(): void }} eff */
export function schedule(eff) {
  pending.add(eff)
  if (!scheduled) {
    scheduled = true
    queueMicrotask(flush)
  }
}

function flush() {
  scheduled = false
  flushing = true
  let guard = 0
  try {
    while (pending.size) {
      if (++guard > 10000) throw new Error('reactive: cycle detected (effect re-scheduled itself)')
      const batch = [...pending]
      pending.clear()
      for (const eff of batch) eff._run()
    }
  } finally {
    flushing = false
  }
}

/** True while effects are running — used for cycle detection on synchronous writes. */
export function isFlushing() {
  return flushing
}
