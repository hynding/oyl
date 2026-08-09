// packages/all-of-oyl/src/insights/day-streak.test.ts
import { describe, expect, it } from 'vitest'
import { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import { Journal } from '../core/journal.js'
import { Measurement } from '../track/measurement.js'
import { activeDaysIn, streakOf } from './day-streak.js'

const day = (v: string) => DayKey.of(v)
const at = (s: string, hourUtc: number) => new Date(`${s}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

describe('streakOf', () => {
  it('is 0 with no active days', () => {
    expect(streakOf(new Set(), day('2026-08-09'))).toBe(0)
  })

  it('counts a run ending today', () => {
    const days = new Set(['2026-08-07', '2026-08-08', '2026-08-09'])
    expect(streakOf(days, day('2026-08-09'))).toBe(3)
  })

  it('an inactive today does not break yesterday\'s streak', () => {
    const days = new Set(['2026-08-07', '2026-08-08'])
    expect(streakOf(days, day('2026-08-09'))).toBe(2)
  })

  it('stops at a gap', () => {
    const days = new Set(['2026-08-09', '2026-08-08', '2026-08-06', '2026-08-05'])
    expect(streakOf(days, day('2026-08-09'))).toBe(2)
  })

  it('a gap before yesterday with an inactive today is 0', () => {
    const days = new Set(['2026-08-06'])
    expect(streakOf(days, day('2026-08-09'))).toBe(0)
  })

  it('crosses month boundaries', () => {
    const days = new Set(['2026-07-30', '2026-07-31', '2026-08-01'])
    expect(streakOf(days, day('2026-08-01'))).toBe(3)
  })
})

describe('activeDaysIn', () => {
  it('collects distinct day keys of entries in range, tz-bucketed by the journal', () => {
    // Build entries with the same constructors insights/review.test.ts uses —
    // any Entry subclass works; only occurredAt matters here. Two entries on
    // one day must yield ONE set member.
    const journal = new Journal('UTC')
    journal.add(new Measurement({ occurredAt: at('2026-08-08', 10), metric: 'custom.pages_read', value: 25 }))
    journal.add(new Measurement({ occurredAt: at('2026-08-08', 15), metric: 'custom.pages_read', value: 10 }))
    journal.add(new Measurement({ occurredAt: at('2026-08-09', 1), metric: 'custom.pages_read', value: 5 }))
    const range = DayRange.of(day('2026-08-01'), day('2026-08-09'))
    const active = activeDaysIn(journal, range)
    expect(active).toEqual(new Set(['2026-08-08', '2026-08-09']))
  })

  it('excludes entries outside the range', () => {
    const journal = new Journal('UTC')
    journal.add(new Measurement({ occurredAt: at('2026-07-01', 12), metric: 'custom.pages_read', value: 25 }))
    const range = DayRange.of(day('2026-08-01'), day('2026-08-09'))
    expect(activeDaysIn(journal, range).size).toBe(0)
  })
})
