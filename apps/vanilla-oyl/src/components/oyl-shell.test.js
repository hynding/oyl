import { beforeAll, describe, expect, it } from 'vitest'
import { defineShell, OylShell } from './oyl-shell.js'
import { signal } from '../lib/reactive/signal.js'
import { byId } from '../layouts/layout-catalog.js'

beforeAll(() => defineShell())

/** @param {string} [layoutId] */
function mount(layoutId) {
  const shell = /** @type {OylShell} */ (document.createElement('oyl-shell'))
  if (layoutId) shell.layoutSignal = signal(layoutId)
  document.body.append(shell)
  return shell
}

describe('oyl-shell', () => {
  it('renders the five grid regions and keeps the slot contract', () => {
    const shell = mount()
    const root = /** @type {ShadowRoot} */ (shell.shadowRoot)
    for (const sel of ['.title', '.nav-dock', '.toolbar', '.widgets', '.page']) {
      expect(root.querySelector(sel), sel).toBeTruthy()
    }
    for (const name of ['nav', 'toolbar', 'widgets', 'main']) {
      expect(root.querySelector(`slot[name="${name}"]`), name).toBeTruthy()
    }
    expect(root.querySelector('h1')?.textContent).toBe('OYL')
  })

  it('defaults to the classic layout without a signal', () => {
    const shell = mount()
    expect(shell.getAttribute('layout')).toBe('classic')
    expect(shell.getAttribute('widgets')).toBe('none')
  })

  it('applies the active layout: host attributes + adopted layout sheet', () => {
    const shell = mount('sidebar')
    expect(shell.getAttribute('layout')).toBe('sidebar')
    expect(shell.getAttribute('widgets')).toBe('rail')
    const root = /** @type {ShadowRoot} */ (shell.shadowRoot)
    expect([...root.adoptedStyleSheets]).toContain(byId('sidebar').styles)
  })

  it('reacts to layout signal changes and keeps baseStyles + baseSheet adopted', async () => {
    const shell = mount('classic')
    const sig = /** @type {import('../lib/reactive/signal.js').Signal<string>} */ (shell.layoutSignal)
    sig.set('wide')
    await Promise.resolve() // effects re-run on a microtask batch (internals.js schedule)
    expect(shell.getAttribute('layout')).toBe('wide')
    const root = /** @type {ShadowRoot} */ (shell.shadowRoot)
    // 3 sheets, layout sheet last so it can override baseSheet within its media scope.
    expect(root.adoptedStyleSheets.length).toBe(3)
    expect(root.adoptedStyleSheets[2]).toBe(byId('wide').styles)
  })

  // happy-dom DOES fire slotchange — the late-slotting assert below exercises the
  // shell's slotchange listener path (not the track() fallback). The awaits are for
  // the reactive core's microtask-batched effect scheduler, not for slotchange.
  it('reflects orientation onto the slotted nav, including late slotting', async () => {
    const shell = mount('sidebar')
    const nav = document.createElement('div')
    nav.slot = 'nav'
    shell.append(nav) // slotted AFTER the layout applied — slotchange must catch it
    await Promise.resolve()
    expect(nav.getAttribute('orientation')).toBe('vertical')
    const sig = /** @type {import('../lib/reactive/signal.js').Signal<string>} */ (shell.layoutSignal)
    sig.set('classic')
    await Promise.resolve() // effects re-run on a microtask batch
    expect(nav.getAttribute('orientation')).toBe('horizontal')
  })

  it('reflects mode onto a slotted widgets element only for widget-bearing layouts', () => {
    const shell = mount('dashboard')
    const deck = document.createElement('div')
    deck.slot = 'widgets'
    shell.append(deck)
    return new Promise((resolve) => {
      queueMicrotask(() => {
        expect(deck.getAttribute('mode')).toBe('band')
        resolve(undefined)
      })
    })
  })

  it('removes the stale mode attribute when switching to a widgets-none layout', async () => {
    const shell = mount('dashboard')
    const deck = document.createElement('div')
    deck.slot = 'widgets'
    shell.append(deck)
    await Promise.resolve()
    expect(deck.getAttribute('mode')).toBe('band')
    const sig = /** @type {import('../lib/reactive/signal.js').Signal<string>} */ (shell.layoutSignal)
    sig.set('focus')
    await Promise.resolve()
    expect(deck.hasAttribute('mode')).toBe(false)
  })

  it('never sets container-type on the host (would trap the fixed mobile nav)', () => {
    const shell = mount('classic')
    const root = /** @type {ShadowRoot} */ (shell.shadowRoot)
    const all = root.adoptedStyleSheets.flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join('\n')
    expect(all).not.toContain('container-type')
  })
})
