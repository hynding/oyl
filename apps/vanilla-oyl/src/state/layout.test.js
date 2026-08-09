import { describe, expect, it } from 'vitest'
import { createLayoutState } from './layout.js'
import { SETTINGS_KEY } from '../storage/keys.js'

const memStorage = () => {
  const m = new Map()
  return {
    getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v),
  }
}

describe('createLayoutState', () => {
  it('defaults to classic with no stored settings', () => {
    expect(createLayoutState(memStorage()).layout.get()).toBe('classic')
  })

  it('reads a persisted layout', () => {
    const storage = memStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ layout: 'sidebar' }))
    expect(createLayoutState(storage).layout.get()).toBe('sidebar')
  })

  it('falls back to classic on unknown or corrupt values', () => {
    for (const raw of [JSON.stringify({ layout: 'cyberpunk' }), '{broken', JSON.stringify({ layout: 7 })]) {
      const storage = memStorage()
      storage.setItem(SETTINGS_KEY, raw)
      expect(createLayoutState(storage).layout.get()).toBe('classic')
    }
  })

  it('setLayout persists and preserves sibling keys (theme)', () => {
    const storage = memStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'forest', mode: 'dark' }))
    const state = createLayoutState(storage)
    state.setLayout('focus')
    expect(state.layout.get()).toBe('focus')
    expect(JSON.parse(/** @type {string} */ (storage.getItem(SETTINGS_KEY)))).toEqual({
      theme: 'forest',
      mode: 'dark',
      layout: 'focus',
    })
  })

  it('setLayout ignores unknown ids', () => {
    const storage = memStorage()
    const state = createLayoutState(storage)
    state.setLayout('cyberpunk')
    expect(state.layout.get()).toBe('classic')
    expect(storage.getItem(SETTINGS_KEY)).toBe(null) // no write happened
  })

  it('refresh() re-reads storage (multi-tab sync)', () => {
    const storage = memStorage()
    const state = createLayoutState(storage)
    storage.setItem(SETTINGS_KEY, JSON.stringify({ layout: 'wide' }))
    state.refresh()
    expect(state.layout.get()).toBe('wide')
  })
})
