// packages/all-of-oyl/src/insights/streak.test.ts
import { describe, expect, it } from 'vitest'
import { streak } from './streak'
import { Goal } from '../goal/goal'
import { DayKey } from '../core/day-key'
import { Journal } from '../core/journal'
import { Measurement } from '../track/measurement'
import { Transaction } from '../finance/transaction'
import { Money } from '../core/money'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)

/** A journal of custom.pages_read measurements at noon UTC on the given days. */
function pagesJournal(...entries: [string, number][]): Journal {
  const j = new Journal(NY)
  let minute = 0
  for (const [dayValue, value] of entries) {
    j.add(new Measurement({ occurredAt: new Date(`${dayValue}T12:${String(minute++).padStart(2, '0')}:00Z`), metric: 'custom.pages_read', value }))
  }
  return j
}

const pagesGoal = () => new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })

describe('streak', () => {
  it('counts consecutive met periods ending at asOf (in-progress atLeast counts once met)', () => {
    const j = pagesJournal(['2026-06-08', 25], ['2026-06-09', 25], ['2026-06-10', 25])
    expect(streak(j, pagesGoal(), day('2026-06-10'))).toBe(3)
  })

  it('a completed unmet period breaks the streak', () => {
    const j = pagesJournal(['2026-06-08', 5], ['2026-06-09', 25], ['2026-06-10', 25])
    expect(streak(j, pagesGoal(), day('2026-06-10'))).toBe(2)
  })

  it('no-data periods bridge — neither break nor extend', () => {
    const j = pagesJournal(['2026-06-05', 25], ['2026-06-06', 25], ['2026-06-09', 25], ['2026-06-10', 25])
    expect(streak(j, pagesGoal(), day('2026-06-10'))).toBe(4)
  })

  it('paused periods bridge even when their numbers were unmet', () => {
    const j = pagesJournal(['2026-06-05', 25], ['2026-06-06', 25], ['2026-06-07', 5], ['2026-06-09', 25], ['2026-06-10', 25])
    const goal = pagesGoal()
    goal.pause(day('2026-06-07'), day('2026-06-07'))
    expect(streak(j, goal, day('2026-06-10'))).toBe(4)
  })

  it('an in-progress atLeast period that is not yet met bridges instead of breaking', () => {
    const j = pagesJournal(['2026-06-09', 25], ['2026-06-10', 10])
    expect(streak(j, pagesGoal(), day('2026-06-10'))).toBe(1)
  })

  it('an in-progress atMost period is excluded until complete — even when currently under target', () => {
    const j = pagesJournal(['2026-06-09', 60], ['2026-06-10', 60])
    const goal = new Goal({ metric: 'custom.pages_read', target: 120, direction: 'atMost', period: 'day' })
    expect(streak(j, goal, day('2026-06-10'))).toBe(1) // today excluded; yesterday met
  })

  it('a completed atMost period over target breaks', () => {
    const j = pagesJournal(['2026-06-08', 60], ['2026-06-09', 200], ['2026-06-10', 60])
    const goal = new Goal({ metric: 'custom.pages_read', target: 120, direction: 'atMost', period: 'day' })
    expect(streak(j, goal, day('2026-06-10'))).toBe(0) // today excluded; yesterday broke it
  })

  it('an empty journal has no streak — even for vacuous-success goals', () => {
    expect(streak(new Journal(NY), pagesGoal(), day('2026-06-10'))).toBe(0)
    const vacuous = new Goal({ metric: 'finance.spend.dining', target: 200, direction: 'atMost', period: 'day', emptyPeriods: 'met' })
    expect(streak(new Journal(NY), vacuous, day('2026-06-10'))).toBe(0)
  })

  it("emptyPeriods 'met' counts vacuous successes, bounded by the journal's span", () => {
    const j = new Journal(NY)
    j.add(new Transaction({ occurredAt: new Date('2026-06-01T16:00:00Z'), amount: Money.usd(500), category: 'dining', direction: 'expense' }))
    const vacuous = new Goal({ metric: 'finance.spend.dining', target: 200, direction: 'atMost', period: 'day', emptyPeriods: 'met' })
    // 06-10 in-progress atMost: excluded. 06-02..06-09 vacuously met (8). 06-01 spent $5 ≤ $200: met (1).
    expect(streak(j, vacuous, day('2026-06-10'))).toBe(9)
  })

  it('weekly goals count weeks', () => {
    const j = pagesJournal(['2026-06-01', 25], ['2026-06-03', 25], ['2026-06-08', 25], ['2026-06-09', 20])
    const weekly = new Goal({ metric: 'custom.pages_read', target: 40, direction: 'atLeast', period: 'week' })
    expect(streak(j, weekly, day('2026-06-10'))).toBe(2) // week of 06-08 has 45 (met, in-progress atLeast); week of 06-01 has 50
  })

  it('retroactive credit: a goal created today still earns its history', () => {
    // identical to the 3-day case — streaks evaluate data, not goal age (the Goal object IS new)
    const j = pagesJournal(['2026-06-08', 25], ['2026-06-09', 25], ['2026-06-10', 25])
    expect(streak(j, new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' }), day('2026-06-10'))).toBe(3)
  })
})
