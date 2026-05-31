// packages/all-of-oyl/modules/user/activity/schedule.test.ts
import { describe, it, expect } from 'vitest'
import { matchesDate, describeSchedule } from './schedule'

describe('matchesDate', () => {
  it('returns false when schedule is undefined', () => {
    expect(matchesDate(undefined, '2026-05-30')).toBe(false)
  })

  it('returns false when rrule is empty', () => {
    expect(matchesDate({ rrule: '' }, '2026-05-30')).toBe(false)
  })

  it('matches daily rule on any date', () => {
    const s = { rrule: 'FREQ=DAILY;DTSTART=20260101T000000Z' }
    expect(matchesDate(s, '2026-05-30')).toBe(true)
  })

  it('matches weekday-only rule on Friday 2026-05-29 but not Saturday 2026-05-30', () => {
    const s = { rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=20260101T000000Z' }
    expect(matchesDate(s, '2026-05-29')).toBe(true)  // Friday
    expect(matchesDate(s, '2026-05-30')).toBe(false) // Saturday
  })
})

describe('describeSchedule', () => {
  it('returns "No schedule" when undefined', () => {
    expect(describeSchedule(undefined)).toBe('No schedule')
  })

  it('returns human text for a daily rule', () => {
    const result = describeSchedule({ rrule: 'FREQ=DAILY' })
    expect(result.toLowerCase()).toContain('every day')
  })
})
