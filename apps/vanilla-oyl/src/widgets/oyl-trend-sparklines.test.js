import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineTrendSparklines, OylTrendSparklines } from './oyl-trend-sparklines.js'

beforeAll(() => defineTrendSparklines())

/** @param {Record<string, number[]>} byKind */
function mount(byKind) {
  const el = /** @type {OylTrendSparklines} */ (document.createElement('oyl-trend-sparklines'))
  el.context = /** @type {any} */ ({
    today: () => DayKey.of('2026-08-09'),
    series: (/** @type {any} */ _r, /** @type {string} */ kind) => byKind[kind] ?? [],
  })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

describe('oyl-trend-sparklines', () => {
  it('renders three labeled rows with an svg each from real data', () => {
    const real = { spending: [1, 2], calories: [3, 4], activeMinutes: [5, 6] }
    const root = mount(real)
    const rows = [...root.querySelectorAll('.row')]
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.querySelector('.k')?.textContent)).toEqual(['Spending', 'Calories', 'Active min'])
    expect(root.querySelectorAll('svg')).toHaveLength(3)
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
  })

  it('all-zero series fall back to the sample with a badge', () => {
    const zero = Array(14).fill(0)
    const root = mount({ spending: zero, calories: zero, activeMinutes: zero })
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
    expect(root.querySelectorAll('svg')).toHaveLength(3)
  })
})
