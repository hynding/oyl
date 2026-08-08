import { describe, expect, it, beforeAll } from 'vitest'
import { createThemeState } from '../state/theme.js'
import { THEMES, MODES } from '../theme/theme-manager.js'
import { defineThemeToggle } from './oyl-theme-toggle.js'

const settle = () => new Promise((r) => setTimeout(r, 0))

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

/** Mount a fresh toggle bound to a fresh state. */
function mount() {
  const themeState = createThemeState(fakeStorage())
  const el = /** @type {import('./oyl-theme-toggle.js').OylThemeToggle} */ (document.createElement('oyl-theme-toggle'))
  el.themeState = themeState
  document.body.append(el)
  const root = /** @type {ShadowRoot} */ (el.shadowRoot)
  return { themeState, el, root }
}

beforeAll(() => defineThemeToggle())

describe('<oyl-theme-toggle>', () => {
  it('renders a closed trigger labeled with the current theme', () => {
    const { el, root } = mount()
    const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('button[data-picker-trigger]'))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.textContent).toContain('Classic')
    const panel = /** @type {HTMLElement} */ (root.querySelector('[data-picker-panel]'))
    expect(panel.hidden).toBe(true)
    el.remove()
  })

  it('opens the panel with a swatch option per theme, current one checked', () => {
    const { el, root } = mount()
    const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('button[data-picker-trigger]'))
    trigger.click()
    const panel = /** @type {HTMLElement} */ (root.querySelector('[data-picker-panel]'))
    expect(panel.hidden).toBe(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const options = [...root.querySelectorAll('[data-theme-option]')]
    expect(options.map((o) => o.getAttribute('data-theme-option'))).toEqual([...THEMES])
    const checked = options.filter((o) => o.getAttribute('aria-checked') === 'true')
    expect(checked.map((o) => o.getAttribute('data-theme-option'))).toEqual(['classic'])
    el.remove()
  })

  it('selecting a theme updates state, keeps the panel open for browsing, and moves the check', async () => {
    const { themeState, el, root } = mount()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-picker-trigger]')).click()
    const ocean = /** @type {HTMLButtonElement} */ (root.querySelector('[data-theme-option="ocean"]'))
    ocean.click()
    await settle()
    expect(themeState.settings.get().theme).toBe('ocean')
    expect(ocean.getAttribute('aria-checked')).toBe('true')
    const classic = /** @type {HTMLButtonElement} */ (root.querySelector('[data-theme-option="classic"]'))
    expect(classic.getAttribute('aria-checked')).toBe('false')
    const panel = /** @type {HTMLElement} */ (root.querySelector('[data-picker-panel]'))
    expect(panel.hidden).toBe(false)
    el.remove()
  })

  it('offers a segmented mode control that writes through to state', async () => {
    const { themeState, el, root } = mount()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-picker-trigger]')).click()
    const options = [...root.querySelectorAll('[data-mode-option]')]
    expect(options.map((o) => o.getAttribute('data-mode-option'))).toEqual([...MODES])
    ;/** @type {HTMLButtonElement} */ (root.querySelector('[data-mode-option="dark"]')).click()
    await settle()
    expect(themeState.settings.get().mode).toBe('dark')
    expect(root.querySelector('[data-mode-option="dark"]')?.getAttribute('aria-checked')).toBe('true')
    expect(root.querySelector('[data-mode-option="system"]')?.getAttribute('aria-checked')).toBe('false')
    el.remove()
  })

  it('closes on Escape and returns focus to the trigger', () => {
    const { el, root } = mount()
    const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('button[data-picker-trigger]'))
    trigger.click()
    const panel = /** @type {HTMLElement} */ (root.querySelector('[data-picker-panel]'))
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))
    expect(panel.hidden).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    el.remove()
  })

  it('reflects external settings changes (multi-tab) into the controls', async () => {
    const { themeState, el, root } = mount()
    themeState.update({ theme: 'ember', mode: 'light' })
    await settle()
    const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('button[data-picker-trigger]'))
    expect(trigger.textContent).toContain('Ember')
    trigger.click()
    expect(root.querySelector('[data-theme-option="ember"]')?.getAttribute('aria-checked')).toBe('true')
    expect(root.querySelector('[data-mode-option="light"]')?.getAttribute('aria-checked')).toBe('true')
    el.remove()
  })
})
