import { describe, expect, it, beforeAll } from 'vitest'
import { defineStatusPanel } from './oyl-status-panel.js'

beforeAll(() => defineStatusPanel())

describe('<oyl-status-panel>', () => {
  it('renders a heading and the supplied diagnostics', () => {
    const el = /** @type {import('./oyl-status-panel.js').OylStatusPanel} */ (document.createElement('oyl-status-panel'))
    el.diagnostics = {
      schema: { status: 'ok', version: 1 },
      counts: { entries: 42, goals: 4 },
      theme: { theme: 'classic', mode: 'system' },
      build: 'dev',
    }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    expect(root.querySelector('h2')).toBeTruthy() // screen heading is h2 (shell owns the page h1)
    const text = root.textContent ?? ''
    expect(text).toContain('entries')
    expect(text).toContain('42')
    el.remove()
  })

  it('repaints when diagnostics is reassigned after connect', () => {
    const el = /** @type {import('./oyl-status-panel.js').OylStatusPanel} */ (document.createElement('oyl-status-panel'))
    el.diagnostics = { schema: { status: 'fresh' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    el.diagnostics = { schema: { status: 'ok', version: 1 }, counts: { entries: 7 }, theme: { theme: 'forest', mode: 'dark' }, build: 'dev' }
    const text = root.textContent ?? ''
    expect(text).toContain('entries')
    expect(text).toContain('7')
    expect(text).toContain('forest')
    el.remove()
  })

  it('invokes action callbacks when buttons are clicked', () => {
    let seeded = false
    const el = /** @type {import('./oyl-status-panel.js').OylStatusPanel} */ (document.createElement('oyl-status-panel'))
    el.actions = { onSeed: () => { seeded = true } }
    el.diagnostics = { schema: { status: 'fresh' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const seedBtn = /** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="seed"]'))
    seedBtn.click()
    expect(seeded).toBe(true)
    el.remove()
  })
})
