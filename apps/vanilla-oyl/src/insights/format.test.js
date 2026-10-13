import { describe, expect, it } from 'vitest'
import { usd, reviewGoalLabel, areaStatsLabel } from './format.js'

describe('usd', () => {
  it('formats a major-unit number as USD via the shared formatter', () => {
    expect(usd(42.5)).toBe('$42.50')
    expect(usd(0)).toBe('$0.00')
    expect(usd(1234)).toBe('$1234.00')
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

describe('areaStatsLabel', () => {
  /** @param {Partial<import('@oyl/all-of-oyl').AreaRollup>} [o] @returns {any} */
  const a = (o = {}) => ({ name: 'Health', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0, ...o })
  it('composes present parts and pluralizes', () => {
    expect(areaStatsLabel(a({ goalsMet: 2, goalsTotal: 3, activityMinutes: 120, projectsTouched: 1 }))).toBe('2/3 goals · 120 min · 1 project')
    expect(areaStatsLabel(a({ projectsTouched: 2 }))).toBe('2 projects')
    expect(areaStatsLabel(a())).toBe('Nothing tracked')
  })
})
