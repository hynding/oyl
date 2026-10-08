import { signal, type Signal } from '../reactive/signal.js'
import type { RouteWindow } from '../ports.js'

export type Navigate = (path: string, opts?: { replace?: boolean }) => void

export interface RouteOptions {
  /** Install app-level link interception (vanilla: delegated anchor clicks); returns its disposer. */
  interceptLinks?: (navigate: Navigate) => () => void
}

export interface RouteState {
  route: Signal<string>
  navigate: Navigate
  start(): void
  stop(): void
}

/**
 * Extract the active route name from a URL pathname. Strips any query/hash and
 * a leading slash, then returns the first path segment — the seam where nested
 * routes (`/journal/:date`) slot in later — defaulting to `'status'`.
 */
export function parsePath(pathname: string): string {
  const path = pathname.replace(/[?#].*$/, '').replace(/^\//, '')
  return path.split('/')[0] || 'status'
}

/**
 * A route signal fed by the History API. Call start() once at boot; returns the
 * signal, an imperative navigate(), and a stop() for teardown (tests).
 */
export function createRouteState(win: RouteWindow, opts: RouteOptions = {}): RouteState {
  const route = signal(parsePath(win.location.pathname))
  const onPop = () => route.set(parsePath(win.location.pathname))

  /**
   * `path` is the `pathname` + optional `?search` to navigate to.
   * Pass `replace: true` to use replaceState (no history growth).
   */
  const navigate: Navigate = (path, { replace = false } = {}) => {
    const url = new win.URL(path, win.location.origin)
    // Reconstruct the full path with search parameters
    const fullPath = url.pathname + url.search
    // Only skip if both pathname and search are identical
    if (fullPath === win.location.pathname + win.location.search) return
    if (replace) win.history.replaceState({}, '', fullPath)
    else win.history.pushState({}, '', fullPath)
    route.set(parsePath(url.pathname))
  }

  let stopLinks: () => void = () => {}

  return {
    route,
    navigate,
    start() {
      win.history.scrollRestoration = 'manual'
      // Canonical home: '/' redirects to '/status' (keep any ?seed query so
      // the dev seed flow in main.js still fires).
      if (win.location.pathname === '/') {
        win.history.replaceState({}, '', '/status' + win.location.search)
        route.set('status')
      }
      win.addEventListener('popstate', onPop)
      stopLinks = opts.interceptLinks ? opts.interceptLinks(navigate) : () => {}
    },
    stop() {
      win.removeEventListener('popstate', onPop)
      stopLinks()
    },
  }
}
