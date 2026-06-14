import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Contact, Cadence, DayKey } from '@oyl/all-of-oyl'
import { defineContactRow } from './oyl-contact-row.js'

beforeAll(() => defineContactRow())
const today = DayKey.of('2026-06-13')
/** @param {Record<string, unknown>} [opts] */
const mkContact = (opts = {}) => new Contact({
  name: 'Sam', lastContactedOn: today.addDays(-95),
  occasions: [{ name: 'birthday', anchor: DayKey.of('1990-06-20'), cadence: Cadence.of(1, 'years') }],
  ...opts,
})

/** @param {any} contact @param {{ onLog?: (id: any) => void, onDelete?: (id: any) => void }} [h] */
function row(contact, h = {}) {
  const el = /** @type {import('./oyl-contact-row.js').OylContactRow} */ (document.createElement('oyl-contact-row'))
  el.contact = contact
  el.today = today
  el.onLog = h.onLog ?? (() => {})
  el.onDelete = h.onDelete ?? (() => {})
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-contact-row>', () => {
  it('renders name, staleness, and a birthday line', () => {
    const el = row(mkContact())
    const text = root(el).textContent ?? ''
    expect(text).toContain('Sam')
    expect(text).toContain('Last contacted')
    expect(text).toContain('Birthday Jun 20')
    el.remove()
  })

  it('never-contacted shows "Never contacted"', () => {
    const el = row(mkContact({ lastContactedOn: undefined }))
    expect(root(el).textContent ?? '').toContain('Never contacted')
    el.remove()
  })

  it('Log contact calls onLog(id)', () => {
    const onLog = vi.fn()
    const c = mkContact()
    const el = row(c, { onLog })
    const b = /** @type {HTMLButtonElement} */ (root(el).querySelector('button[data-act="log"]'))
    b.click()
    expect(onLog).toHaveBeenCalledWith(c.id)
    el.remove()
  })

  it('Delete uses inline confirm: Yes calls onDelete(id), No reverts', () => {
    const onDelete = vi.fn()
    const c = mkContact()
    const el = row(c, { onDelete })
    const r = root(el)
    const del1 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del1.click()
    const no = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-no"]'))
    no.click()
    expect(r.querySelector('button[data-act="delete"]')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
    const del2 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del2.click()
    const yes = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    expect(onDelete).toHaveBeenCalledWith(c.id)
    el.remove()
  })
})
