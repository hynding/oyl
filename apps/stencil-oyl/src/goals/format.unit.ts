import { describe, expect, it } from 'vitest'
import { GOAL_PERIODS, type GoalProgress } from '@oyl/all-of-oyl'
import { PERIOD_OPTIONS, PRESETS, PRESET_OPTIONS, goalProgressLabel, metricUnit, summaryLine } from './format.js'

const progress = (over: Partial<GoalProgress>): GoalProgress => ({ current: 0, target: 1, ratio: 0, paused: false, empty: false, ...over })

describe('PRESETS', () => {
  it("are vanilla's five, in order, with select options by index", () => {
    expect(PRESETS.map((p) => [p.label, p.metric, p.direction, p.aggregation, p.period])).toEqual([
      ['Sleep (hours)', 'sleep.hours', 'atLeast', 'sum', 'day'],
      ['Weight (kg)', 'body.weight_kg', 'atMost', 'last', 'day'],
      ['Calories', 'nutrition.calories', 'atMost', 'sum', 'day'],
      ['Run minutes', 'activity.run.minutes', 'atLeast', 'sum', 'week'],
      ['Screen time (min)', 'screen.minutes', 'atMost', 'sum', 'day'],
    ])
    expect(PRESET_OPTIONS).toEqual(PRESETS.map((p, i) => ({ value: String(i), label: p.label })))
  })

  it('PERIOD_OPTIONS come from the domain list', () => {
    expect(PERIOD_OPTIONS).toEqual(GOAL_PERIODS.map((p) => ({ value: p, label: p })))
  })
})

describe('metricUnit', () => {
  it('maps the preset metrics and is empty for unknown ones', () => {
    expect(['sleep.hours', 'body.weight_kg', 'nutrition.calories', 'activity.run.minutes', 'screen.minutes', 'x'].map(metricUnit)).toEqual(['h', 'kg', 'kcal', 'min', 'min', ''])
  })
})

describe('goalProgressLabel', () => {
  it('paused and empty take precedence', () => {
    expect(goalProgressLabel(progress({ paused: true, empty: true }), 'atLeast', 'h')).toBe('Paused')
    expect(goalProgressLabel(progress({ empty: true }), 'atLeast', 'h')).toBe('No data this period')
  })

  it('atLeast → "x / y u", atMost → "x of y u used", compact numbers, optional unit', () => {
    expect(goalProgressLabel(progress({ current: 12, target: 20 }), 'atLeast', 'h')).toBe('12 / 20 h')
    expect(goalProgressLabel(progress({ current: 7.5, target: 8 }), 'atLeast', 'h')).toBe('7.5 / 8 h')
    expect(goalProgressLabel(progress({ current: 6.25, target: 8 }), 'atLeast', 'h')).toBe('6.3 / 8 h')
    expect(goalProgressLabel(progress({ current: 1800, target: 2200 }), 'atMost', 'kcal')).toBe('1800 of 2200 kcal used')
    expect(goalProgressLabel(progress({ current: 3, target: 5 }), 'atLeast', '')).toBe('3 / 5')
  })
})

describe('summaryLine', () => {
  it('is empty without goals', () => {
    expect(summaryLine([])).toBe('')
  })

  it('counts met and paused', () => {
    expect(summaryLine([progress({ met: true }), progress({ met: false }), progress({ paused: true })])).toBe('1 of 3 met today · 1 paused')
    expect(summaryLine([progress({ met: true }), progress({ met: true })])).toBe('2 of 2 met today')
    expect(summaryLine([progress({ empty: true })])).toBe('0 of 1 met today')
  })
})
