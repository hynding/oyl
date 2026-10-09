import { describe, expect, it } from 'vitest'
import type { AreaRollup, GoalProgress } from '@oyl/all-of-oyl'
import { INSIGHTS_PERIODS, TILES, activityLabel, areaStatsLabel, completionLabel, deltaLabel, reviewGoalLabel, usd } from './format.js'

const progress = (over: Partial<GoalProgress>): GoalProgress => ({ current: 0, target: 1, ratio: 0, paused: false, empty: false, ...over })
const area = (over: Partial<AreaRollup>): AreaRollup => ({ name: 'x', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0, ...over })

describe('lists', () => {
  it('periods and tiles', () => {
    expect(INSIGHTS_PERIODS).toEqual([{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }])
    expect(TILES.map((t) => [t.key, t.caption])).toEqual([['spending', 'Spent'], ['activity', 'Active min'], ['calories', 'Calories'], ['completion', 'Plans done']])
  })
})

describe('usd', () => {
  it('formats a major-unit number', () => {
    expect(usd(42.5)).toBe('$42.50')
    expect(usd(0)).toBe('$0.00')
  })
})

describe('reviewGoalLabel', () => {
  it('paused > empty > met > percent', () => {
    expect(reviewGoalLabel(progress({ paused: true, empty: true }))).toBe('Paused')
    expect(reviewGoalLabel(progress({ empty: true, met: true }))).toBe('No data')
    expect(reviewGoalLabel(progress({ met: true, ratio: 1 }))).toBe('Met')
    expect(reviewGoalLabel(progress({ met: false, ratio: 0.6 }))).toBe('60%')
  })
})

describe('areaStatsLabel', () => {
  it('joins the present parts', () => {
    expect(areaStatsLabel(area({ goalsMet: 2, goalsTotal: 3, activityMinutes: 120.4, projectsTouched: 1 }))).toBe('2/3 goals · 120 min · 1 project')
    expect(areaStatsLabel(area({ projectsTouched: 2 }))).toBe('2 projects')
    expect(areaStatsLabel(area({}))).toBe('Nothing tracked')
  })
})

describe('activityLabel', () => {
  it('minutes and count', () => {
    expect(activityLabel({ slug: 'run', minutes: 120.2, count: 3 })).toBe('120 min · 3×')
    expect(activityLabel({ slug: 'run', minutes: 0, count: 3 })).toBe('3×')
    expect(activityLabel({ slug: 'run', minutes: 45, count: 0 })).toBe('45 min')
    expect(activityLabel({ slug: 'run', minutes: 0, count: 0 })).toBe('')
  })
})

describe('deltaLabel', () => {
  it('arrow + magnitude, hidden when the rounded magnitude is zero', () => {
    expect(deltaLabel(0, false)).toBe('')
    expect(deltaLabel(42.5, true)).toBe('↑ $42.50')
    expect(deltaLabel(-42.5, true)).toBe('↓ $42.50')
    expect(deltaLabel(20.4, false)).toBe('↑ 20')
    expect(deltaLabel(-20, false)).toBe('↓ 20')
    expect(deltaLabel(0.3, false)).toBe('')
    expect(deltaLabel(0.004, true)).toBe('')
  })
})

describe('completionLabel', () => {
  it('"—" when undefined, else a rounded percent', () => {
    expect(completionLabel(undefined)).toBe('—')
    expect(completionLabel(0.754)).toBe('75%')
    expect(completionLabel(0)).toBe('0%')
  })
})
