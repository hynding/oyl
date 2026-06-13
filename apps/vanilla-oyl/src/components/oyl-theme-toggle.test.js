import { describe, expect, it, beforeAll } from 'vitest'
import { createThemeState } from '../state/theme.js'
import { defineThemeToggle } from './oyl-theme-toggle.js'

function fakeStorage() {
  const map = new Map()
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

beforeAll(() => defineThemeToggle())

describe('<oyl-theme-toggle>', () => {
  it('renders selects reflecting current settings and writes changes back', async () => {
    const themeState = createThemeState(fakeStorage())
    const el = /** @type {import('./oyl-theme-toggle.js').OylThemeToggle} */ (document.createElement('oyl-theme-toggle'))
    el.themeState = themeState
    document.body.append(el)

    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const themeSelect = /** @type {HTMLSelectElement} */ (root.querySelector('select[name="theme"]'))
    expect(themeSelect.value).toBe('classic')

    themeSelect.value = 'forest'
    themeSelect.dispatchEvent(new Event('change'))
    expect(themeState.settings.get().theme).toBe('forest')

    el.remove()
  })
})
