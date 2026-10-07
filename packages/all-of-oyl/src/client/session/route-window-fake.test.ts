import { describe, expect, it, vi } from 'vitest'
import { fakeRouteWindow } from './route-window-fake.js'

describe('fakeRouteWindow', () => {
  it('tracks pushState/replaceState in location and history length', () => {
    const win = fakeRouteWindow('/journal?x=1')
    expect(win.location.pathname).toBe('/journal')
    expect(win.location.search).toBe('?x=1')
    win.history.pushState({}, '', '/vault')
    expect(win.location.pathname).toBe('/vault')
    expect(win.history.length).toBe(2)
    win.history.replaceState({}, '', '/goals#h')
    expect(win.location.pathname).toBe('/goals')
    expect(win.location.hash).toBe('#h')
    expect(win.history.length).toBe(2)
  })

  it('dispatches registered listeners and honours removal', () => {
    const win = fakeRouteWindow()
    const fn = vi.fn()
    win.addEventListener('popstate', fn)
    win.dispatch('popstate')
    win.removeEventListener('popstate', fn)
    win.dispatch('popstate')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
