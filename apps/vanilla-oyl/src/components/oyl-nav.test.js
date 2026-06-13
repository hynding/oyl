import { describe, expect, it, beforeAll } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { defineNav } from './oyl-nav.js'

beforeAll(() => defineNav())

describe('<oyl-nav>', () => {
  it('marks the active route and updates when the route changes', async () => {
    const route = signal('status')
    const el = /** @type {import('./oyl-nav.js').OylNav} */ (document.createElement('oyl-nav'))
    el.routeSignal = route
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)

    const statusLink = /** @type {HTMLAnchorElement} */ (root.querySelector('a[data-route="status"]'))
    const journalLink = /** @type {HTMLAnchorElement} */ (root.querySelector('a[data-route="journal"]'))
    expect(statusLink.getAttribute('aria-current')).toBe('page')
    expect(journalLink.hasAttribute('aria-current')).toBe(false)
    expect(journalLink.getAttribute('href')).toBe('#/journal')

    route.set('journal')
    await Promise.resolve()
    expect(journalLink.getAttribute('aria-current')).toBe('page')
    expect(statusLink.hasAttribute('aria-current')).toBe(false)
    el.remove()
  })
})
