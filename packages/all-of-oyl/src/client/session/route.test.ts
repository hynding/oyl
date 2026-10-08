import { describe, expect, it, vi } from 'vitest'
import { parsePath, createRouteState } from './route.js'
import { fakeRouteWindow } from './route-window-fake.js'

describe('parsePath', () => {
  it('defaults root/empty to status', () => {
    expect(parsePath('/')).toBe('status')
    expect(parsePath('')).toBe('status')
  })

  it('extracts the first path segment', () => {
    expect(parsePath('/status')).toBe('status')
    expect(parsePath('/journal')).toBe('journal')
    expect(parsePath('/journal/today')).toBe('journal')
  })

  it('handles trailing slashes and query strings', () => {
    expect(parsePath('/journal/')).toBe('journal')
    expect(parsePath('/journal?seed')).toBe('journal')
  })
})

describe('createRouteState', () => {
  it('initializes the signal from the current pathname', () => {
    const win = fakeRouteWindow('/planner')
    const rs = createRouteState(win)
    expect(rs.route.get()).toBe('planner')
  })

  it('navigate() pushes state and updates the signal', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    rs.navigate('/vault')
    expect(win.location.pathname).toBe('/vault')
    expect(rs.route.get()).toBe('vault')
  })

  it('navigate() preserves the query in the URL but not the route name', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    rs.navigate('/journal?seed')
    expect(win.location.pathname).toBe('/journal')
    expect(win.location.search).toBe('?seed')
    expect(rs.route.get()).toBe('journal')
  })

  it('navigate() to the current path does not push state', () => {
    const win = fakeRouteWindow('/vault')
    const rs = createRouteState(win)
    const spy = vi.spyOn(win.history, 'pushState')
    rs.navigate('/vault')
    expect(spy).not.toHaveBeenCalled()
  })

  it('start() makes the signal track popstate', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    rs.start()
    win.history.pushState({}, '', '/goals')
    win.dispatch('popstate')
    expect(rs.route.get()).toBe('goals')
    rs.stop()
  })

  it('start() redirects / to /status, preserving the query', () => {
    const win = fakeRouteWindow('/?seed')
    const rs = createRouteState(win)
    rs.start()
    expect(win.location.pathname).toBe('/status')
    expect(win.location.search).toBe('?seed')
    expect(rs.route.get()).toBe('status')
    rs.stop()
  })

  it('navigate(path, { replace: true }) uses replaceState and does not grow history', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    const lenBefore = win.history.length
    const pushSpy = vi.spyOn(win.history, 'pushState')
    const replaceSpy = vi.spyOn(win.history, 'replaceState')
    rs.navigate('/login', { replace: true })
    expect(win.location.pathname).toBe('/login')
    expect(rs.route.get()).toBe('login')
    expect(pushSpy).not.toHaveBeenCalled()
    expect(replaceSpy).toHaveBeenCalled()
    expect(win.history.length).toBe(lenBefore)
  })

  it('navigate(path) default still uses pushState', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    const pushSpy = vi.spyOn(win.history, 'pushState')
    rs.navigate('/vault')
    expect(pushSpy).toHaveBeenCalled()
  })
})

describe('createRouteState seams', () => {
  it('resolves paths against the origin via win.URL (relative and query-only included)', () => {
    const win = fakeRouteWindow('/journal/2026-06-16')
    const rs = createRouteState(win)
    rs.navigate('planner/today')
    expect(win.location.pathname).toBe('/planner/today')
    expect(rs.route.get()).toBe('planner')
    rs.navigate('?seed')
    expect(win.location.pathname + win.location.search).toBe('/?seed')
    expect(rs.route.get()).toBe('status')
  })

  it('start() installs the injected link interceptor with navigate; stop() disposes it', () => {
    const win = fakeRouteWindow('/journal')
    const dispose = vi.fn()
    const interceptLinks = vi.fn(() => dispose)
    const rs = createRouteState(win, { interceptLinks })
    expect(interceptLinks).not.toHaveBeenCalled()
    rs.start()
    expect(interceptLinks).toHaveBeenCalledWith(rs.navigate)
    rs.stop()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('works without an interceptor (start/stop are safe)', () => {
    const rs = createRouteState(fakeRouteWindow('/journal'))
    expect(() => { rs.start(); rs.stop() }).not.toThrow()
  })
})
