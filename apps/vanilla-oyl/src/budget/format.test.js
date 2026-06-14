import { describe, expect, it } from 'vitest'
import { Money } from '@oyl/all-of-oyl'
import { budgetLabel } from './format.js'

/** @param {boolean} met @returns {any} */
const prog = (met) => ({ current: 0, target: 0, ratio: met ? 0.5 : 1, met, paused: false, empty: false })

describe('budgetLabel', () => {
  it('shows spent/limit and remaining when under budget', () => {
    expect(budgetLabel(prog(true), Money.of(180000, 'USD', 2), Money.of(220000, 'USD', 2))).toBe('$1800.00 of $2200.00 · $400.00 left')
  })
  it('shows over-by when over budget', () => {
    expect(budgetLabel(prog(false), Money.of(230000, 'USD', 2), Money.of(220000, 'USD', 2))).toBe('$2300.00 of $2200.00 · over by $100.00')
  })
})
