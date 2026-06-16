import { describe, it, expect } from 'vitest'
import { createBrowserConnectivity } from './connectivity.js'

/** @param {boolean} online */
function fakeWindow(online) {
  /** @type {Record<string, ((e: any) => void)[]>} */
  const listeners = {}
  return {
    navigator: { onLine: online },
    /** @param {string} t @param {(e: any) => void} cb */
    addEventListener: (t, cb) => { (listeners[t] ||= []).push(cb) },
    /** @param {string} t @param {(e: any) => void} cb */
    removeEventListener: (t, cb) => { listeners[t] = (listeners[t] || []).filter((f) => f !== cb) },
    /** @param {string} t */
    _fire: (t) => { for (const cb of listeners[t] || []) cb({}) },
  }
}

describe('createBrowserConnectivity', () => {
  it('reports navigator.onLine and notifies on online/offline events', () => {
    const win = fakeWindow(true)
    const c = createBrowserConnectivity(/** @type {any} */ (win))
    expect(c.isOnline()).toBe(true)
    /** @type {boolean[]} */
    const seen = []
    const unsub = c.subscribe((o) => seen.push(o))
    win._fire('offline'); win._fire('online')
    expect(seen).toEqual([false, true])
    unsub()
    win._fire('offline')
    expect(seen).toEqual([false, true])
  })
})
