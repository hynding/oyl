import { beforeAll, describe, expect, it } from 'vitest'
import { defineLayoutPicker, OylLayoutPicker } from './oyl-layout-picker.js'
import { createLayoutState } from '../state/layout.js'
import { LAYOUTS } from '../layouts/layout-catalog.js'

beforeAll(() => defineLayoutPicker())

const memStorage = () => {
  const m = new Map()
  return {
    getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v),
  }
}

function mount() {
  const state = createLayoutState(memStorage())
  const el = /** @type {OylLayoutPicker} */ (document.createElement('oyl-layout-picker'))
  el.layoutState = state
  document.body.append(el)
  const root = /** @type {ShadowRoot} */ (el.shadowRoot)
  return { el, state, root }
}

describe('oyl-layout-picker', () => {
  it('offers every catalog layout as a radio option', () => {
    const { root } = mount()
    const options = [...root.querySelectorAll('[data-layout-option]')]
    expect(options.map((o) => o.getAttribute('data-layout-option'))).toEqual(LAYOUTS.map((l) => l.id))
  })

  it('opens on trigger click and reflects the active layout', () => {
    const { root } = mount()
    const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-trigger]'))
    const panel = /** @type {HTMLElement} */ (root.querySelector('[data-layout-panel]'))
    expect(panel.hidden).toBe(true)
    trigger.click()
    expect(panel.hidden).toBe(false)
    expect(root.querySelector('[data-layout-option="classic"]')?.getAttribute('aria-checked')).toBe('true')
    expect(trigger.textContent).toContain('Classic')
  })

  it('selecting an option writes the state (and only the state)', async () => {
    const { root, state } = mount()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-trigger]')).click()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-option="sidebar"]')).click()
    await Promise.resolve() // effects re-run on a microtask batch (internals.js schedule)
    expect(state.layout.get()).toBe('sidebar')
    expect(root.querySelector('[data-layout-option="sidebar"]')?.getAttribute('aria-checked')).toBe('true')
    expect(root.querySelector('[data-layout-option="classic"]')?.getAttribute('aria-checked')).toBe('false')
  })

  it('arrow keys rove selection to the next catalog option', async () => {
    const { root, state } = mount()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-trigger]')).click()
    const group = /** @type {HTMLElement} */ (root.querySelector('[role="radiogroup"]'))
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve() // effects re-run on a microtask batch (internals.js schedule)
    // classic is active by default; ArrowDown advances one in catalog order
    const next = /** @type {(typeof LAYOUTS)[number]} */ (LAYOUTS[1]).id
    expect(state.layout.get()).toBe(next)
    expect(root.querySelector(`[data-layout-option="${next}"]`)?.getAttribute('aria-checked')).toBe('true')
    expect(root.querySelector('[data-layout-option="classic"]')?.getAttribute('aria-checked')).toBe('false')
  })

  it('reflects external state changes (multi-tab refresh path)', async () => {
    const { root, state } = mount()
    state.setLayout('wide')
    await Promise.resolve() // effects re-run on a microtask batch (internals.js schedule)
    const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-trigger]'))
    expect(trigger.textContent).toContain('Wide')
  })

  it('anchors the panel to the viewport on mobile (fixed sheet, not a host flyout)', () => {
    // Structural: happy-dom can't evaluate media queries, so assert the sheet's shape.
    // Same defect class as oyl-theme-toggle: a host-anchored absolute panel overflows
    // the left viewport edge once the toolbar squeezes the host leftward on phones.
    const mobileRules = /** @type {CSSStyleSheet[]} */ (OylLayoutPicker.styles)
      .flatMap((s) => [...s.cssRules])
      .filter((r) => 'conditionText' in r && /** @type {CSSMediaRule} */ (r).conditionText === '(max-width: 640px)')
      .flatMap((r) => [.../** @type {CSSMediaRule} */ (r).cssRules].map((inner) => inner.cssText))
    expect(mobileRules.some((t) => t.includes('.panel') && /position:\s*fixed/.test(t))).toBe(true)
  })
})
