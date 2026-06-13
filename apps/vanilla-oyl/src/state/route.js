import { signal } from '../lib/reactive/signal.js'

/** Extract the active route name from a location hash. @param {string} hash @returns {string} */
export function parseHash(hash) {
  const seg = hash.replace(/^#\/?/, '').split('/')[0]
  return seg || 'status'
}

/**
 * A route signal fed by hashchange. Call start() once at boot; returns the signal and
 * a stop() for teardown (tests).
 * @param {Window} win
 */
export function createRouteState(win = window) {
  const route = signal(parseHash(win.location.hash))
  const onHash = () => route.set(parseHash(win.location.hash))
  return {
    route,
    start() {
      win.addEventListener('hashchange', onHash)
    },
    stop() {
      win.removeEventListener('hashchange', onHash)
    },
  }
}
