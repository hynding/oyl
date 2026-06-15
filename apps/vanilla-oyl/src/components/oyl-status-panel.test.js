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

describe('<oyl-status-panel> account section', () => {
  it('renders an oyl-auth wired to the auth state', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    const auth = { session: { get: () => null, set: () => {} }, logout: () => {} }
    el.auth = auth
    document.body.append(el)
    await Promise.resolve()
    const authEl = /** @type {any} */ (el.shadowRoot.querySelector('oyl-auth'))
    expect(authEl).toBeTruthy()
    expect(authEl.auth).toBe(auth)
    el.remove()
  })
})

describe('<oyl-status-panel> connection section', () => {
  /** @param {'local'|'remote'} mode */
  function connConfig(mode) {
    return { mode, apiBaseUrl: 'http://localhost:1340/api', defaultApiBaseUrl: 'http://localhost:1340/api', onApply: () => {} }
  }

  it('renders an oyl-connection wired to the connection config', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    const connection = connConfig('local')
    el.connection = connection
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const connEl = /** @type {any} */ (el.shadowRoot.querySelector('oyl-connection'))
    expect(connEl).toBeTruthy()
    expect(connEl.connection).toBe(connection)
    el.remove()
  })

  it('enables the local-data actions in local mode', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.connection = connConfig('local')
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    expect(/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="seed"]')).disabled).toBe(false)
    expect(root.querySelector('#local-tools-note')).toBeNull()
    el.remove()
  })

  it('disables and explains the local-data actions in remote mode', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.connection = connConfig('remote')
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    for (const act of ['seed', 'export', 'import', 'reset']) {
      expect(/** @type {HTMLButtonElement} */ (root.querySelector(`button[data-act="${act}"]`)).disabled).toBe(true)
    }
    const note = root.querySelector('#local-tools-note')
    expect(note).toBeTruthy()
    expect(note?.textContent).toMatch(/remote mode/i)
    el.remove()
  })
})
