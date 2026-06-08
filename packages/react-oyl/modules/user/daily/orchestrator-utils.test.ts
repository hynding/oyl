// packages/react-oyl/modules/user/daily/orchestrator-utils.test.ts
import { describe, it, expect } from 'vitest'
import type { TUserActivityData, TUserGoalData, TUserNutritionData, TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { filterActivitiesForDate, filterGoalsForDate, filterNutritionsForDate, computeDailyTotals } from './orchestrator-utils'

const DATE = '2026-05-30'

// ---------------------------------------------------------------------------
// filterActivitiesForDate
// ---------------------------------------------------------------------------
describe('filterActivitiesForDate', () => {
  it('includes an active activity whose schedule matches the date', () => {
    const activities = [
      { id: 1, current_status: 'active', schedule: { rrule: 'FREQ=DAILY;DTSTART=20260101T000000Z' } },
      { id: 2, current_status: 'paused', schedule: { rrule: 'FREQ=DAILY;DTSTART=20260101T000000Z' } },
    ] as unknown as TUserActivityData[]

    const result = filterActivitiesForDate(activities, [], DATE)
    expect(result.map(a => a.id)).toEqual([1])
  })

  it('includes a pinned activity even when it is paused', () => {
    const activities = [
      { id: 3, current_status: 'paused', schedule: { rrule: 'FREQ=DAILY;DTSTART=20260101T000000Z' } },
    ] as unknown as TUserActivityData[]

    const result = filterActivitiesForDate(activities, [3], DATE)
    expect(result.map(a => a.id)).toEqual([3])
  })

  it('excludes an active activity whose schedule does not match the date', () => {
    // WEEKLY on Monday — 2026-05-30 is a Saturday, so should not match
    const activities = [
      { id: 4, current_status: 'active', schedule: { rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=20260101T000000Z' } },
    ] as unknown as TUserActivityData[]

    const result = filterActivitiesForDate(activities, [], DATE)
    expect(result).toHaveLength(0)
  })

  it('includes pinned activities even when schedule does not match', () => {
    // WEEKLY on Monday — 2026-05-30 is a Saturday, so schedule does not match
    const acts = [
      { id: 9, current_status: 'active' as const, schedule: { rrule: 'FREQ=WEEKLY;DTSTART=20260101T000000Z;BYDAY=MO' } },
    ]
    const result = filterActivitiesForDate(acts as unknown as TUserActivityData[], [9], DATE)
    expect(result.map(a => a.id)).toEqual([9])
  })

  it('includes an active activity with no schedule (undefined or null)', () => {
    // Activities added without picking a schedule (or returned from Strapi as null)
    // should still appear on the daily page so the user can interact with them.
    const activities = [
      { id: 5, current_status: 'active', schedule: undefined },
      { id: 6, current_status: 'active', schedule: null },
    ] as unknown as TUserActivityData[]

    const result = filterActivitiesForDate(activities, [], DATE)
    expect(result.map(a => a.id)).toEqual([5, 6])
  })

  it('still excludes a non-active activity with no schedule', () => {
    const activities = [
      { id: 7, current_status: 'paused', schedule: undefined },
      { id: 8, current_status: 'archived', schedule: null },
    ] as unknown as TUserActivityData[]

    const result = filterActivitiesForDate(activities, [], DATE)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// filterGoalsForDate
// ---------------------------------------------------------------------------
describe('filterGoalsForDate', () => {
  it('includes an active goal with no target_date', () => {
    const goals = [
      { id: 10, current_status: 'active' },
    ] as unknown as TUserGoalData[]

    const result = filterGoalsForDate(goals, [], DATE)
    expect(result.map(g => g.id)).toEqual([10])
  })

  it('excludes an active goal whose target_date is in the past', () => {
    const goals = [
      { id: 11, current_status: 'active', target_date: '2026-01-01' },
    ] as unknown as TUserGoalData[]

    const result = filterGoalsForDate(goals, [], DATE)
    expect(result).toHaveLength(0)
  })

  it('includes a completed/paused goal when it is pinned', () => {
    const goals = [
      { id: 12, current_status: 'completed' },
      { id: 13, current_status: 'paused' },
    ] as unknown as TUserGoalData[]

    const result = filterGoalsForDate(goals, [12, 13], DATE)
    expect(result.map(g => g.id)).toEqual([12, 13])
  })
})

// ---------------------------------------------------------------------------
// filterNutritionsForDate / computeDailyTotals
// ---------------------------------------------------------------------------

function mkLog(opts: Partial<TUserNutritionData> & { item?: Partial<TNutritionItemData> }): TUserNutritionData {
  return {
    id: 1, documentId: 'log',
    date: '2026-06-02T12:00:00.000Z',
    servings: 1,
    user: 1,
    name: 'X',
    nutrition_item: opts.item
      ? ({ id: 1, documentId: 'item', name: 'X', serving_unit: 'g', source: 'user', serving_size: 100, calories_per_100: 100, ...opts.item } as TNutritionItemData)
      : (1 as unknown as TNutritionItemData),
    ...opts,
  } as TUserNutritionData
}

describe('filterNutritionsForDate', () => {
  it('keeps logs whose local date matches and excludes deleted', () => {
    const logs = [
      mkLog({ id: 1, date: '2026-06-02T03:00:00.000Z' }),
      mkLog({ id: 2, date: '2026-06-02T22:00:00.000Z' }),
      mkLog({ id: 3, date: '2026-06-03T01:00:00.000Z' }),
      { ...mkLog({ id: 4, date: '2026-06-02T15:00:00.000Z' }), deleted_at: 'now' } as TUserNutritionData,
    ]
    const result = filterNutritionsForDate(logs, '2026-06-02', 'UTC')
    expect(result.map(l => l.id)).toEqual([1, 2])
  })

  it('sorts chronologically ascending', () => {
    const logs = [
      mkLog({ id: 1, date: '2026-06-02T22:00:00.000Z' }),
      mkLog({ id: 2, date: '2026-06-02T08:00:00.000Z' }),
    ]
    expect(filterNutritionsForDate(logs, '2026-06-02', 'UTC').map(l => l.id)).toEqual([2, 1])
  })
})

describe('computeDailyTotals', () => {
  it('sums macros computed from servings × item per-100 × serving_size/100', () => {
    const rows = [
      { log: mkLog({ servings: 2, item: { calories_per_100: 100, serving_size: 100 } }), item: { id: 1, documentId: 'i', name: 'X', serving_unit: 'g', source: 'user', serving_size: 100, calories_per_100: 100 } as TNutritionItemData },
    ]
    const totals = computeDailyTotals(rows as never, { calories: 1000 })
    expect(totals.calories).toBe(200)
    expect(totals.progress.calories).toBeCloseTo(0.2)
  })

  it('returns undefined progress when target missing', () => {
    const totals = computeDailyTotals([], {})
    expect(totals.progress.calories).toBeUndefined()
  })

  it('falls back to snapshot macros when item is null', () => {
    const log = { ...mkLog({ servings: 1, calories: 250 }), nutrition_item: null as unknown as TNutritionItemData }
    const totals = computeDailyTotals([{ log: log as TUserNutritionData, item: null } as never], {})
    expect(totals.calories).toBe(250)
  })
})
