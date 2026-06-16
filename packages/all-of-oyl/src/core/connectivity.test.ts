import { describe, it, expect } from 'vitest'
import { alwaysOnline, alwaysOffline, manualConnectivity } from './connectivity.js'

describe('connectivity test doubles', () => {
  it('alwaysOnline / alwaysOffline report fixed state', () => {
    expect(alwaysOnline().isOnline()).toBe(true)
    expect(alwaysOffline().isOnline()).toBe(false)
  })

  it('manualConnectivity flips state and notifies subscribers', () => {
    const c = manualConnectivity(false)
    expect(c.isOnline()).toBe(false)
    const seen: boolean[] = []
    const unsub = c.subscribe((o) => seen.push(o))
    c.setOnline(true)
    c.setOnline(false)
    expect(c.isOnline()).toBe(false)
    expect(seen).toEqual([true, false])
    unsub()
    c.setOnline(true)
    expect(seen).toEqual([true, false])
  })
})
