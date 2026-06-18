import { signal } from '../lib/reactive/signal.js'
import { interceptLinks } from './link-interceptor.js'

/**
 * Extract the active route name from a URL pathname. Strips any query/hash and
 * a leading slash, then returns the first path segment — the seam where nested
 * routes (`/journal/:date`) slot in later — defaulting to `'status'`.
 * @param {string} pathname
 * @returns {string}
 */
export function parsePath(pathname) {
  const path = pathname.replace(/[?#].*$/, '').replace(/^\//, '')
  return path.split('/')[0] || 'status'
}

/**
 * A route signal fed by the History API. Call start() once at boot; returns the
 * signal, an imperative navigate(), and a stop() for teardown (tests).
 * @param {Window} win
 */
export function createRouteState(win = window) {
  const route = signal(parsePath(win.location.pathname))
  const onPop = () => route.set(parsePath(win.location.pathname))

  /**
   * @param {string} path  `pathname` + optional `?search` to navigate to
   * @param {{ replace?: boolean }} [opts]  pass `replace: true` to use replaceState (no history growth)
   */
  const navigate = (path, { replace = false } = {}) => {
    const url = new URL(path, win.location.origin)
    // Reconstruct the full path with search parameters
    const fullPath = url.pathname + url.search
    // Only skip if both pathname and search are identical
    if (fullPath === win.location.pathname + win.location.search) return
    if (replace) win.history.replaceState({}, '', fullPath)
    else win.history.pushState({}, '', fullPath)
    route.set(parsePath(url.pathname))
  }

  /** @type {() => void} */
  let stopLinks = () => {}

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
      stopLinks = interceptLinks(win, navigate)
    },
    stop() {
      win.removeEventListener('popstate', onPop)
      stopLinks()
    },
  }
}
