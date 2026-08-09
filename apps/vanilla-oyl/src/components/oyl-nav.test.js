import { describe, expect, it, beforeAll } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { defineNav, OylNav } from './oyl-nav.js'

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
    expect(journalLink.getAttribute('href')).toBe('/journal')

    route.set('journal')
    await Promise.resolve()
    expect(journalLink.getAttribute('aria-current')).toBe('page')
    expect(statusLink.hasAttribute('aria-current')).toBe(false)
    el.remove()
  })

  it('includes a Planner link to /planner and marks it active', async () => {
    const route = signal('planner')
    const el = /** @type {import('./oyl-nav.js').OylNav} */ (document.createElement('oyl-nav'))
    el.routeSignal = route
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const link = /** @type {HTMLAnchorElement} */ (root.querySelector('a[data-route="planner"]'))
    expect(link.getAttribute('href')).toBe('/planner')
    expect(link.getAttribute('aria-current')).toBe('page')
    el.remove()
  })

  it('scopes every orientation-keyed rule to desktop widths', () => {
    // Structural: happy-dom can't evaluate media queries, so assert the sheet's shape.
    // An unscoped [orientation] rule would override the mobile bottom-bar rules.
    const sheets = /** @type {CSSStyleSheet[]} */ (OylNav.styles)
    const offenders = []
    for (const s of sheets) {
      for (const rule of s.cssRules) {
        const text = /** @type {CSSStyleRule} */ (rule).selectorText ?? ''
        if (text.includes('[orientation')) offenders.push(rule.cssText)
        if ('conditionText' in rule && /** @type {CSSMediaRule} */ (rule).conditionText !== '(min-width: 641px)') {
          // media blocks other than the mobile one and the desktop one are unexpected
          if (/** @type {CSSMediaRule} */ (rule).conditionText !== '(max-width: 640px)') offenders.push(rule.cssText)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('has vertical-orientation rules inside the desktop media block', () => {
    const sheets = /** @type {CSSStyleSheet[]} */ (OylNav.styles)
    const desktopRules = sheets
      .flatMap((s) => [...s.cssRules])
      .filter((r) => 'conditionText' in r && /** @type {CSSMediaRule} */ (r).conditionText === '(min-width: 641px)')
      .flatMap((r) => [.../** @type {CSSMediaRule} */ (r).cssRules].map((inner) => inner.cssText))
    expect(desktopRules.some((t) => t.includes('[orientation="vertical"]'))).toBe(true)
  })
})
