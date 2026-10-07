import { track, type Source } from './internals.js'

/**
 * Run `fn` now and re-run it (batched on a microtask) whenever a signal/computed it
 * read changes. Returns a dispose function that detaches it from all sources.
 *
 * Cycle detection assumes read-before-write: an effect that reads then writes the same
 * signal throws synchronously; an effect that writes a signal before reading it is not
 * detected (it simply won't react to that write).
 */
export function effect(fn: () => void): () => void {
  let disposed = false
  let running = false
  let sources = new Set<Source>()

  const runner = {
    _addSource(src: Source) {
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
