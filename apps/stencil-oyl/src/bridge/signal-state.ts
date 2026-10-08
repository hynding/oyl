import { effect } from '@oyl/all-of-oyl/client'

/**
 * The signals ↔ Stencil bridge. Mirrors a signal into component state:
 *
 *   @State() route = ''
 *   private stop = () => {}
 *   connectedCallback() { this.stop = bindSignal(this.routeSignal, (r) => (this.route = r)) }
 *   disconnectedCallback() { this.stop() }
 *
 * `apply` runs now with the current value and again (batched on a microtask) whenever the
 * signal changes, until the returned disposer is called. Components read the mirror in
 * render(), never `signal.get()` (an untracked read goes stale silently).
 */
export function bindSignal<T>(source: { get(): T }, apply: (value: T) => void): () => void {
  return effect(() => apply(source.get()))
}
