/**
 * Shared reactive runtime: the active-observer stack (autotracking) and the microtask
 * effect scheduler. Kept in one module so signal/computed/effect share one graph.
 * @typedef {{ _addSource(src: { _subs: Set<object> }): void }} Observer
 */

/** Hard cap on flush iterations before we abort a non-settling update loop. */
const MAX_FLUSH_ITERATIONS = 1000

/** @type {any} */
let activeObserver = null
/** @type {Set<{ _run(): void }>} */
const pending = new Set()
let scheduled = false

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
  let guard = 0
  while (pending.size) {
    if (++guard > MAX_FLUSH_ITERATIONS) {
      pending.clear()
      console.error(
        'reactive: aborting update loop after ' + MAX_FLUSH_ITERATIONS +
          ' iterations — likely a cyclic signal dependency that never settles',
      )
      break
    }
    const batch = [...pending]
    pending.clear()
    for (const eff of batch) eff._run()
  }
}
