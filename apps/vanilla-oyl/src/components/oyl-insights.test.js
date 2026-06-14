import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineInsights } from './oyl-insights.js'

beforeAll(() => defineInsights())

/** @param {Record<string, unknown>} [over] @returns {any} */
const review = (over = {}) => ({
  period: null,
  goals: [{ goalId: 'g1', name: 'Sleep enough', progress: { current: 7, target: 7, ratio: 1, met: true, paused: false, empty: false }, streak: 3 }],
  topSpending: [{ category: 'groceries', total: 42.5 }],
  activityTotals: [{ slug: 'run', count: 0, minutes: 100 }],
  completionRate: 0.5,
  totals: { spending: 42.5, activityMinutes: 100, calories: 1800 },
  previousTotals: { spending: 40, activityMinutes: 80, calories: 1800 },
  deltas: { spending: 2.5, activityMinutes: 20, calories: 0 },
  areas: [],
  ...over,
})

/** @param {any} reviewOn */
function screen(reviewOn) {
  const el = /** @type {import('./oyl-insights.js').OylInsights} */ (document.createElement('oyl-insights'))
  el.reviewOn = reviewOn
  el.tz = 'UTC'
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-insights>', () => {
  it('renders totals, deltas, goals+streak, spending, activity, completion', async () => {
    const el = screen(() => review())
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('$42.50')
    expect(text).toContain('100')
    expect(text).toContain('Sleep enough')
    expect(text).toContain('Met')
    expect(text).toContain('🔥 3')
    expect(text).toContain('groceries')
    expect(text).toContain('run')
    expect(text).toContain('100 min')
    expect(text).toContain('50%')
    expect(root(el).querySelectorAll('.stat .d').length).toBeGreaterThan(0)
    el.remove()
  })

  it('omits delta chips when deltas are 0 and renders empty states', async () => {
    const el = screen(() => review({
      goals: [], topSpending: [], activityTotals: [],
      completionRate: undefined,
      totals: { spending: 0, activityMinutes: 0, calories: 0 },
      deltas: { spending: 0, activityMinutes: 0, calories: 0 },
    }))
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('No goals yet')
    expect(text).toContain('Nothing this period')
    expect(text).toContain('—')
    expect(root(el).querySelector('.stat .d')).toBeNull()
    expect(text).toContain('No areas tracked')
    el.remove()
  })

  it('re-queries reviewOn when the period changes', async () => {
    const reviewOn = vi.fn(() => review())
    const el = screen(reviewOn)
    await Promise.resolve()
    const before = reviewOn.mock.calls.length
    const sel = /** @type {HTMLSelectElement} */ (root(el).querySelector('select'))
    sel.value = 'week'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
    expect(reviewOn.mock.calls.length).toBeGreaterThan(before)
    el.remove()
  })

  it('renders the Life areas section (named always; unassigned only with signal; guards 0/0)', async () => {
    const el = screen(() => review({ areas: [
      { areaId: 'a1', name: 'Health', goalsMet: 2, goalsTotal: 3, activityMinutes: 120, projectsTouched: 1 },
      { areaId: 'a2', name: 'Family', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0 },
      { name: 'unassigned', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0 },
    ] }))
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('Health')
    expect(text).toContain('2/3 goals')
    expect(text).toContain('Family')
    expect(text).toContain('Nothing tracked')
    expect(text).not.toContain('Unassigned')
    const fills = /** @type {HTMLElement[]} */ ([...root(el).querySelectorAll('.area-bar .fill')])
    expect(fills).toHaveLength(1)
    for (const f of fills) expect(f.style.getPropertyValue('inline-size')).not.toContain('NaN')
    el.remove()
  })
})
