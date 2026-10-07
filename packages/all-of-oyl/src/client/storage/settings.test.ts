import { describe, expect, it } from 'vitest'
import { readRawSettings } from './settings.js'
import { SETTINGS_KEY } from './keys.js'

const memStorage = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

describe('readRawSettings', () => {
  it('returns the stored object verbatim, unknown keys included', () => {
    const storage = memStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'forest', layout: 'sidebar', future: 1 }))
    expect(readRawSettings(storage)).toEqual({ theme: 'forest', layout: 'sidebar', future: 1 })
  })
  it('returns {} when missing', () => {
    expect(readRawSettings(memStorage())).toEqual({})
  })
  it('returns {} on corrupt JSON', () => {
    const storage = memStorage()
    storage.setItem(SETTINGS_KEY, '{nope')
    expect(readRawSettings(storage)).toEqual({})
  })
  it('returns {} on non-object JSON (number, array, null)', () => {
    for (const raw of ['7', '[1]', 'null']) {
      const storage = memStorage()
      storage.setItem(SETTINGS_KEY, raw)
      expect(readRawSettings(storage)).toEqual({})
    }
  })
})
