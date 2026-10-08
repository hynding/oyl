import type { RouteWindow } from '../ports.js'

const ORIGIN = 'http://localhost:8041'

/** RouteWindow over an in-memory history stack, for node-env route/auth tests. */
export function fakeRouteWindow(initialPath = '/') {
  const listeners = new Map<string, Set<() => void>>()
  let current = new URL(initialPath, ORIGIN)
  const entries: string[] = [href()]
  function href() { return current.pathname + current.search + current.hash }
  const location = {
    get pathname() { return current.pathname },
    get search() { return current.search },
    get hash() { return current.hash },
    get origin() { return ORIGIN },
  }
  const history = {
    scrollRestoration: 'auto',
    get length() { return entries.length },
    pushState(_d: unknown, _u: string, url: string) { current = new URL(url, current); entries.push(href()) },
    replaceState(_d: unknown, _u: string, url: string) { current = new URL(url, current); entries[entries.length - 1] = href() },
  }
  const win = {
    location,
    history,
    URL,
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(fn)
    },
    removeEventListener(type: string, fn: () => void) { listeners.get(type)?.delete(fn) },
    /** Fire every listener registered for `type` (e.g. simulate a back-button popstate). */
    dispatch(type: string) { for (const fn of [...(listeners.get(type) ?? [])]) fn() },
  }
  return win satisfies RouteWindow
}
