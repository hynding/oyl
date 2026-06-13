import { describe, expect, it, beforeAll, vi } from 'vitest'
import { DayKey, Note, Measurement } from '@oyl/all-of-oyl'
import { defineLogForm } from './oyl-log-form.js'

beforeAll(() => defineLogForm())

/** @param {{ add: (e: any) => Promise<any> }} store @param {DayKey} [day] */
function form(store, day = DayKey.of('2026-06-10')) {
  const el = /** @type {import('./oyl-log-form.js').OylLogForm} */ (document.createElement('oyl-log-form'))
  el.store = /** @type {any} */ (store)
  el.getDay = () => day
  document.body.append(el)
  return el
}
/** @param {Element} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)
/** @param {Element} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (root(el).querySelector(sel))

describe('<oyl-log-form>', () => {
  it('logs a note via store.add with the typed text and tags', async () => {
    const added = /** @type {any[]} */ ([])
    const store = { add: async (/** @type {any} */ e) => { added.push(e); return e } }
    const el = form(store)
    q(el, 'textarea[name="text"]').value = 'Long run by the river'
    q(el, 'input[name="tags"]').value = 'gratitude exercise'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(added).toHaveLength(1)
    expect(added[0]).toBeInstanceOf(Note)
    expect(added[0].text).toBe('Long run by the river')
    expect([...added[0].tags]).toEqual(['gratitude', 'exercise'])
    el.remove()
  })

  it('logs a measurement when the type is switched', async () => {
    const added = /** @type {any[]} */ ([])
    const store = { add: async (/** @type {any} */ e) => { added.push(e); return e } }
    const el = form(store)
    q(el, 'button[data-type="measurement"]').click()
    q(el, 'select[name="metric"]').value = 'body.weight_kg'
    q(el, 'input[name="value"]').value = '81.4'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Measurement)
    expect(added[0].metric).toBe('body.weight_kg')
    expect(added[0].value).toBe(81.4)
    el.remove()
  })

  it('renders a domain error inline and does not call store.add on invalid input', async () => {
    const store = { add: vi.fn(async (e) => e) }
    const el = form(store)
    q(el, 'textarea[name="text"]').value = ''
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(store.add).not.toHaveBeenCalled()
    expect((root(el).querySelector('[data-role="error"]')?.textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })

  it('marks the field aria-invalid and describes it by the error on failure', async () => {
    const store = { add: async (/** @type {any} */ e) => e }
    const el = form(store)
    q(el, 'textarea[name="text"]').value = '' // invalid: empty note
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    const ta = q(el, 'textarea[name="text"]')
    expect(ta.getAttribute('aria-invalid')).toBe('true')
    expect(ta.getAttribute('aria-describedby')).toBe('log-error')
    el.remove()
  })
})
