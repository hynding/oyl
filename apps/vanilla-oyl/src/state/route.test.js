import { describe, expect, it, beforeEach, vi } from 'vitest'
import { parsePath, createRouteState } from './route.js'

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
  beforeEach(() => {
    window.history.replaceState({}, '', '/journal')
  })

  it('initializes the signal from the current pathname', () => {
    window.history.replaceState({}, '', '/planner')
    const rs = createRouteState(window)
    expect(rs.route.get()).toBe('planner')
  })

  it('navigate() pushes state and updates the signal', () => {
    const rs = createRouteState(window)
    rs.navigate('/vault')
    expect(window.location.pathname).toBe('/vault')
    expect(rs.route.get()).toBe('vault')
  })

  it('navigate() preserves the query in the URL but not the route name', () => {
    const rs = createRouteState(window)
    rs.navigate('/journal?seed')
    expect(window.location.pathname).toBe('/journal')
    expect(window.location.search).toBe('?seed')
    expect(rs.route.get()).toBe('journal')
  })

  it('navigate() to the current path does not push state', () => {
    window.history.replaceState({}, '', '/vault')
    const rs = createRouteState(window)
    const spy = vi.spyOn(window.history, 'pushState')
    rs.navigate('/vault')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('start() makes the signal track popstate', () => {
    const rs = createRouteState(window)
    rs.start()
    window.history.pushState({}, '', '/goals')
    window.dispatchEvent(new Event('popstate'))
    expect(rs.route.get()).toBe('goals')
    rs.stop()
  })

  it('start() redirects / to /status, preserving the query', () => {
    window.history.replaceState({}, '', '/?seed')
    const rs = createRouteState(window)
    rs.start()
    expect(window.location.pathname).toBe('/status')
    expect(window.location.search).toBe('?seed')
    expect(rs.route.get()).toBe('status')
    rs.stop()
  })
})
