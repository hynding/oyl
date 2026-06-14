import { describe, expect, it } from 'vitest'
import { money, reviewGoalLabel } from './format.js'

describe('money', () => {
  it('formats major-unit numbers as currency', () => {
    expect(money(42.5)).toBe('$42.50')
    expect(money(0)).toBe('$0.00')
    expect(money(1234)).toBe('$1234.00')
  })
})

describe('reviewGoalLabel', () => {
  /** @param {Partial<import('@oyl/all-of-oyl').GoalProgress>} [o] @returns {any} */
  const p = (o = {}) => ({ current: 0, target: 10, ratio: 0, paused: false, empty: false, ...o })
  it('prioritizes paused, then empty, then met, else percent', () => {
    expect(reviewGoalLabel(p({ paused: true }))).toBe('Paused')
    expect(reviewGoalLabel(p({ empty: true }))).toBe('No data')
    expect(reviewGoalLabel(p({ met: true }))).toBe('Met')
    expect(reviewGoalLabel(p({ ratio: 0.8 }))).toBe('80%')
  })
})
