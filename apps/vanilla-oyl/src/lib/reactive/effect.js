import { track } from './internals.js'

/**
 * Run `fn` now and re-run it (batched on a microtask) whenever a signal/computed it
 * read changes. Returns a dispose function that detaches it from all sources.
 * @param {() => void} fn
 * @returns {() => void} dispose
 */
export function effect(fn) {
  let disposed = false
  let running = false
  /** @type {Set<{ _subs: Set<object> }>} */
  let sources = new Set()

  const runner = {
    /** @param {{ _subs: Set<object> }} src */
    _addSource(src) {
      sources.add(src)
    },
    _run() {
      if (disposed) return
      if (running) throw new Error('reactive: cycle detected (effect re-entered during its own run)')
      for (const src of sources) src._subs.delete(runner)
      sources = new Set()
      running = true
      try {
        track(runner, fn)
      } finally {
        running = false
      }
    },
  }

  runner._run()

  return () => {
    if (disposed) return
    disposed = true
    for (const src of sources) src._subs.delete(runner)
    sources.clear()
  }
}
