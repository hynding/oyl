import { describe, expect, it } from 'vitest'
import { metricUnit, goalProgressLabel } from './format.js'

describe('metricUnit', () => {
  it('maps known metrics and falls back to empty', () => {
    expect(metricUnit('sleep.hours')).toBe('h')
    expect(metricUnit('body.weight_kg')).toBe('kg')
    expect(metricUnit('nutrition.calories')).toBe('kcal')
    expect(metricUnit('whatever.unknown')).toBe('')
  })
})

describe('goalProgressLabel', () => {
  /** @param {Partial<import('@oyl/all-of-oyl').GoalProgress>} [o] @returns {any} */
  const prog = (o = {}) => ({ current: 0, target: 10, ratio: 0, paused: false, empty: false, ...o })
  it('atLeast shows current / target', () => {
    expect(goalProgressLabel(prog({ current: 12, target: 20 }), 'atLeast', 'h')).toBe('12 / 20 h')
  })
  it('atMost shows used phrasing', () => {
    expect(goalProgressLabel(prog({ current: 1800, target: 2200 }), 'atMost', 'kcal')).toBe('1800 of 2200 kcal used')
  })
  it('formats decimals compactly', () => {
    expect(goalProgressLabel(prog({ current: 6.5, target: 7 }), 'atLeast', 'h')).toBe('6.5 / 7 h')
  })
  it('paused and empty take precedence', () => {
    expect(goalProgressLabel(prog({ paused: true }), 'atLeast', 'h')).toBe('Paused')
    expect(goalProgressLabel(prog({ empty: true }), 'atMost', 'kcal')).toBe('No data this period')
  })
})
