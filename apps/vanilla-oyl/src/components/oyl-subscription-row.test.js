import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Subscription, Cadence, Money, DayKey } from '@oyl/all-of-oyl'
import { defineSubscriptionRow } from './oyl-subscription-row.js'

beforeAll(() => defineSubscriptionRow())

const today = DayKey.of('2026-06-13')
/** @param {Record<string, unknown>} [opts] */
const mkSub = (opts = {}) => new Subscription({
  name: 'Netflix', amount: Money.of(1399, 'USD', 2), cadence: Cadence.of(1, 'months'),
  anchor: today, category: 'entertainment', ...opts,
})

/** @param {any} subscription @param {{ onRenew?: (id: any) => void, onDelete?: (id: any) => void }} [h] */
function row(subscription, h = {}) {
  const el = /** @type {import('./oyl-subscription-row.js').OylSubscriptionRow} */ (document.createElement('oyl-subscription-row'))
  el.subscription = subscription
  el.today = today
  el.onRenew = h.onRenew ?? (() => {})
  el.onDelete = h.onDelete ?? (() => {})
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-subscription-row>', () => {
  it('renders name, amount, cadence and next-due', () => {
    const el = row(mkSub())
    const text = root(el).textContent ?? ''
    expect(text).toContain('Netflix')
    expect(text).toContain('$13.99')
    expect(text.toLowerCase()).toContain('every month')
    expect(text).toContain('Renews')
    el.remove()
  })

  it('Renew calls onRenew(id)', () => {
    const onRenew = vi.fn()
    const s = mkSub()
    const el = row(s, { onRenew })
    const btn = /** @type {HTMLButtonElement} */ (root(el).querySelector('button[data-act="renew"]'))
    btn.click()
    expect(onRenew).toHaveBeenCalledWith(s.id)
    el.remove()
  })

  it('Delete uses inline confirm: Yes calls onDelete(id), No reverts', () => {
    const onDelete = vi.fn()
    const s = mkSub()
    const el = row(s, { onDelete })
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
    expect(onDelete).toHaveBeenCalledWith(s.id)
    el.remove()
  })

  it('marks a lapsed (past-due) renewal as overdue', () => {
    const el = row(mkSub({ anchor: DayKey.of('2026-06-01') })) // pending = 2026-06-01 < today
    expect(root(el).querySelector('.overdue')).toBeTruthy()
    el.remove()
  })
})
