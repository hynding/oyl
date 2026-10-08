// Host globals present in every runtime (browsers, Node, workers). Declared locally because the
// browser build has no DOM lib and `types: []` — same precedent as core/id.ts.
declare function queueMicrotask(callback: () => void): void
declare const console: { error(...data: unknown[]): void }

/** Shared reactive runtime: the active-observer stack (autotracking) and the microtask
 * effect scheduler. Kept in one module so signal/computed/effect share one graph. */
export interface Source { _subs: Set<object> }
export interface Observer { _addSource(src: Source): void }
export interface Runnable { _run(): void }

/** Hard cap on flush iterations before we abort a non-settling update loop. */
const MAX_FLUSH_ITERATIONS = 1000

let activeObserver: any = null
const pending = new Set<Runnable>()
let scheduled = false

export function getActiveObserver(): any {
  return activeObserver
}

/** Run `fn` with `observer` as the active tracking target, restoring the previous one. */
export function track<T>(observer: any, fn: () => T): T {
  const prev = activeObserver
  activeObserver = observer
  try {
    return fn()
  } finally {
    activeObserver = prev
  }
}

/** Queue an effect to run on the next microtask batch. */
export function schedule(eff: Runnable): void {
  pending.add(eff)
  if (!scheduled) {
    scheduled = true
    queueMicrotask(flush)
  }
}

function flush(): void {
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
