// packages/react-oyl/modules/user/daily-new/orchestrator-utils.test.ts
import { describe, it, expect } from 'vitest'
import type { TUserActivityData, TUserGoalData } from '@oyl/all-of-oyl/modules'
import { filterActivitiesForDate, filterGoalsForDate } from './orchestrator-utils'

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
