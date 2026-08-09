import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defineWidgets, OylWidgets } from './oyl-widgets.js'

beforeAll(() => defineWidgets())

/** @param {readonly { id: string, label: string, create(ctx: any): HTMLElement }[]} widgets */
function mount(widgets) {
  const deck = /** @type {OylWidgets} */ (document.createElement('oyl-widgets'))
  deck.context = /** @type {any} */ ({ tz: 'UTC' })
  deck.widgets = widgets
  document.body.append(deck)
  return /** @type {ShadowRoot} */ (deck.shadowRoot)
}

const stub = (/** @type {string} */ id) => ({
  id,
  label: id,
  create: () => Object.assign(document.createElement('div'), { textContent: id }),
})

describe('oyl-widgets', () => {
  it('renders one card per registry entry, in registry order', () => {
    const root = mount([stub('a'), stub('b')])
    const cards = [...root.querySelectorAll('.card')]
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.textContent)).toEqual(['a', 'b'])
  })

  it('isolates a throwing widget as a muted unavailable card and logs the error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = { id: 'boom', label: 'Boom', create: () => { throw new Error('nope') } }
    const root = mount([stub('a'), boom, stub('b')])
    const cards = [...root.querySelectorAll('.card')]
    expect(cards).toHaveLength(3)
    expect(cards[1]?.classList.contains('failed')).toBe(true)
    expect(cards[1]?.textContent).toContain('unavailable')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('scopes every mode-keyed rule to desktop widths (deck leg of the structural test)', () => {
    const offenders = []
    for (const sheetObj of /** @type {CSSStyleSheet[]} */ (OylWidgets.styles)) {
      for (const rule of sheetObj.cssRules) {
        const sel = /** @type {CSSStyleRule} */ (rule).selectorText ?? ''
        if (sel.includes('[mode')) offenders.push(rule.cssText)
        if ('conditionText' in rule && /** @type {CSSMediaRule} */ (rule).conditionText !== '(min-width: 641px)') {
          offenders.push(rule.cssText)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('has rail and band rules inside the desktop media block', () => {
    const desktop = /** @type {CSSStyleSheet[]} */ (OylWidgets.styles)
      .flatMap((s) => [...s.cssRules])
      .filter((r) => 'conditionText' in r && /** @type {CSSMediaRule} */ (r).conditionText === '(min-width: 641px)')
      .flatMap((r) => [.../** @type {CSSMediaRule} */ (r).cssRules].map((x) => x.cssText))
    expect(desktop.some((t) => t.includes('[mode="rail"]'))).toBe(true)
    expect(desktop.some((t) => t.includes('[mode="band"]'))).toBe(true)
  })
})
