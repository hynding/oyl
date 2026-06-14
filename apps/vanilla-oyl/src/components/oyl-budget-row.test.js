import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Budget, Money } from '@oyl/all-of-oyl'
import { defineBudgetRow } from './oyl-budget-row.js'

beforeAll(() => defineBudgetRow())
const limit = Money.of(220000, 'USD', 2) // $2200
const mkBudget = () => new Budget({ category: 'groceries', limit })
/** @param {boolean} met @param {number} spentMinor @param {number} ratio @returns {any} */
const status = (met, spentMinor, ratio) => ({ progress: { current: 0, target: 0, ratio, met, paused: false, empty: false }, spent: Money.of(spentMinor, 'USD', 2) })

/** @param {any} budget @param {any} st @param {{ onDelete?: any }} [h] */
function row(budget, st, h = {}) {
  const el = /** @type {import('./oyl-budget-row.js').OylBudgetRow} */ (document.createElement('oyl-budget-row'))
  el.budget = budget
  el.status = st
  el.onDelete = h.onDelete ?? (() => {})
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-budget-row>', () => {
  it('under budget: bar sized to ratio, "left" label, no .over', () => {
    const el = row(mkBudget(), status(true, 180000, 180000 / 220000))
    const r = root(el)
    expect(r.textContent).toContain('groceries')
    expect(r.textContent).toContain('$400.00 left')
    expect(r.querySelector('.bar.over')).toBeNull()
    const fill = /** @type {HTMLElement} */ (r.querySelector('.fill'))
    expect(fill.style.getPropertyValue('inline-size')).not.toContain('NaN')
    el.remove()
  })

  it('over budget: .over styling + "over by" label', () => {
    const el = row(mkBudget(), status(false, 230000, 1))
    const r = root(el)
    expect(r.querySelector('.bar.over')).toBeTruthy()
    expect(r.textContent).toContain('over by $100.00')
    el.remove()
  })

  it('Delete uses inline confirm: Yes calls onDelete(id), No reverts', () => {
    const onDelete = vi.fn()
    const b = mkBudget()
    const el = row(b, status(true, 0, 0), { onDelete })
    const r = root(el)
    const del1 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del1.click()
    const no = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-no"]'))
    no.click()
    expect(onDelete).not.toHaveBeenCalled()
    const del2 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del2.click()
    const yes = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    expect(onDelete).toHaveBeenCalledWith(b.id)
    el.remove()
  })
})
