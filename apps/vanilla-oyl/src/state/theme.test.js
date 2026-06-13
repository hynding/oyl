import { describe, expect, it } from 'vitest'
import { createThemeState } from './theme.js'
import { SETTINGS_KEY } from '../storage/keys.js'

/** @param {Record<string,string>} [seed] */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
    /** @param {string} k @param {string} v */ setItem: (k, v) => void map.set(k, v),
    /** @param {string} k */ removeItem: (k) => void map.delete(k),
    /** @param {number} i */ key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('theme state', () => {
  it('defaults when storage is empty', () => {
    const state = createThemeState(fakeStorage())
    expect(state.settings.get()).toEqual({ theme: 'classic', mode: 'system' })
  })

  it('hydrates from stored settings', () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: 'forest', mode: 'dark' }) })
    const state = createThemeState(storage)
    expect(state.settings.get()).toEqual({ theme: 'forest', mode: 'dark' })
  })

  it('update() persists and updates the signal', () => {
    const storage = fakeStorage()
    const state = createThemeState(storage)
    state.update({ theme: 'forest' })
    expect(state.settings.get().theme).toBe('forest')
    expect(JSON.parse(/** @type {string} */ (storage.getItem(SETTINGS_KEY))).theme).toBe('forest')
  })
})
