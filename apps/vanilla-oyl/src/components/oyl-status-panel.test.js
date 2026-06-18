import { describe, expect, it, beforeAll } from 'vitest'
import { defineStatusPanel } from './oyl-status-panel.js'
import { signal } from '../lib/reactive/signal.js'

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
  it('no longer renders the auth form (moved to /login + /register)', () => {
    const panel = /** @type {any} */ (document.createElement('oyl-status-panel'))
    panel.connection = { mode: 'local', apiBaseUrl: '', defaultApiBaseUrl: '', onApply: () => {} }
    document.body.append(panel)
    expect(panel.shadowRoot.querySelector('oyl-auth')).toBeFalsy()
    panel.remove()
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

describe('<oyl-status-panel> sync section', () => {
  /** @type {any} */
  const synced = { online: true, pending: 0, status: 'idle', conflicts: 0, lastSyncedAt: new Date() }
  const diag = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }

  it('renders a Sync section + Resync button (remote); click calls onResync', async () => {
    let resynced = false
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = { state: signal(synced), onResync: () => { resynced = true } }
    el.diagnostics = diag
    document.body.append(el)
    await Promise.resolve()
    const btn = /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="resync"]'))
    expect(btn).toBeTruthy()
    btn.click()
    expect(resynced).toBe(true)
    el.remove()
  })

  it('disables Resync when offline', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = { state: signal({ ...synced, online: false, status: 'offline' }), onResync: () => {} }
    el.diagnostics = diag
    document.body.append(el)
    await Promise.resolve()
    expect(/** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="resync"]')).disabled).toBe(true)
    el.remove()
  })

  it('renders no Sync section in local mode (sync null)', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.diagnostics = diag
    document.body.append(el)
    expect(el.shadowRoot.querySelector('button[data-act="resync"]')).toBeNull()
    el.remove()
  })
})

describe('<oyl-status-panel> failed writes', () => {
  const diag = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }

  it('shows Retry + Discard when failed>0; clicks call handlers', async () => {
    let retried = false; let discarded = false
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = {
      state: signal({ online: true, pending: 0, status: 'idle', conflicts: 0, failed: 2, lastSyncedAt: new Date() }),
      onResync: () => {},
      onRetryFailed: () => { retried = true },
      onDiscardFailed: () => { discarded = true },
    }
    el.diagnostics = diag
    document.body.append(el)
    await Promise.resolve()
    const retry = /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="retry-failed"]'))
    const discard = /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="discard-failed"]'))
    expect(retry).toBeTruthy(); expect(discard).toBeTruthy()
    expect(retry.hidden).toBe(false); expect(discard.hidden).toBe(false)
    expect(el.shadowRoot.textContent).toContain("2 writes couldn't sync")
    retry.click(); discard.click()
    expect(retried).toBe(true); expect(discarded).toBe(true)
    el.remove()
  })

  it('no Retry/Discard visible when failed is 0', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = {
      state: signal({ online: true, pending: 0, status: 'idle', conflicts: 0, failed: 0, lastSyncedAt: new Date() }),
      onResync: () => {},
      onRetryFailed: () => {},
      onDiscardFailed: () => {},
    }
    el.diagnostics = diag
    document.body.append(el)
    await Promise.resolve()
    expect(el.shadowRoot.querySelector('button[data-act="retry-failed"]')?.hidden).toBe(true)
    el.remove()
  })

  it('uses the singular form for one failed write', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = {
      state: signal({ online: true, pending: 0, status: 'idle', conflicts: 0, failed: 1, lastSyncedAt: new Date() }),
      onResync: () => {}, onRetryFailed: () => {}, onDiscardFailed: () => {},
    }
    el.diagnostics = diag
    document.body.append(el)
    await Promise.resolve()
    expect(el.shadowRoot.textContent).toContain("1 write couldn't sync")
    el.remove()
  })
})

describe('<oyl-status-panel> migration button', () => {
  const diag = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
  it('shows Upload local data (N) when migration set; click calls onUpload + hides', () => {
    let uploaded = false
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.migration = { count: 5, onUpload: () => { uploaded = true } }
    el.diagnostics = diag
    document.body.append(el)
    const btn = /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="upload-local"]'))
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain('5')
    btn.click()
    expect(uploaded).toBe(true)
    expect(btn.hidden).toBe(true)
    el.remove()
  })
  it('no button when migration is null or count 0', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.diagnostics = diag
    document.body.append(el)
    expect(el.shadowRoot.querySelector('button[data-act="upload-local"]')).toBeNull()
    el.remove()
  })
})
