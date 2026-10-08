import { describe, it, expect } from 'vitest'
import { createBrowserConnectivity } from './connectivity.js'

function fakeWindow(online: boolean) {
  const listeners: Record<string, ((e: any) => void)[]> = {}
  return {
    navigator: { onLine: online },
    addEventListener: (t: string, cb: (e: any) => void) => { (listeners[t] ||= []).push(cb) },
    removeEventListener: (t: string, cb: (e: any) => void) => { listeners[t] = (listeners[t] || []).filter((f) => f !== cb) },
    _fire: (t: string) => { for (const cb of listeners[t] || []) cb({}) },
  }
}

describe('createBrowserConnectivity', () => {
  it('reports navigator.onLine and notifies on online/offline events', () => {
    const win = fakeWindow(true)
    const c = createBrowserConnectivity(win)
    expect(c.isOnline()).toBe(true)
    const seen: boolean[] = []
    const unsub = c.subscribe((o) => seen.push(o))
    win._fire('offline'); win._fire('online')
    expect(seen).toEqual([false, true])
    unsub()
    win._fire('offline')
    expect(seen).toEqual([false, true])
  })
})
