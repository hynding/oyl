// packages/all-of-oyl/src/insights/daily-series.test.ts
import { describe, expect, it } from 'vitest'
import { Activity } from '../activity/activity.js'
import { ActivitySession } from '../activity/activity-session.js'
import { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import { Journal } from '../core/journal.js'
import { LifeArea } from '../core/life-area.js'
import { Money } from '../core/money.js'
import { Quantity } from '../core/quantity.js'
import { Transaction } from '../finance/transaction.js'
import { Consumption } from '../nutrition/consumption.js'
import { activeMinutesOn, caloriesOn, dailySeries, spendingOn } from './daily-series.js'

const day = (v: string) => DayKey.of(v)
const at = (s: string, hourUtc: number) => new Date(`${s}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

describe('dailySeries', () => {
  it('yields one value per day in range order, zero-filled', () => {
    const journal = new Journal('UTC')
    const range = DayRange.of(day('2026-08-05'), day('2026-08-07'))
    const series = dailySeries(journal, range, () => 0)
    expect(series).toEqual([0, 0, 0])
  })

  it('feeds each day to the selector in order', () => {
    const journal = new Journal('UTC')
    const range = DayRange.of(day('2026-08-05'), day('2026-08-07'))
    const seen: string[] = []
    dailySeries(journal, range, (_j, d) => {
      seen.push(d.value)
      return seen.length
    })
    expect(seen).toEqual(['2026-08-05', '2026-08-06', '2026-08-07'])
  })
})

describe('metric day-selectors', () => {
  // Fixtures mirror insights/review.test.ts: a spend transaction (Money is
  // asserted in whole-currency units there — usd(2500) totals 25), a
  // consumption carrying nutrition.calories, and an activity session whose
  // metrics include both activity.run.minutes AND the auto-emitted
  // activity.run.count (which must NOT leak into activeMinutesOn).
  it('spendingOn / caloriesOn / activeMinutesOn bucket per day and ignore other days', () => {
    const health = new LifeArea({ name: 'Health', slug: 'health' })
    const run = new Activity({ name: 'Run', slug: 'run', areaId: health.id })
    const journal = new Journal('UTC')
    journal.add(new Transaction({ occurredAt: at('2026-08-06', 18), amount: Money.usd(2500), category: 'groceries', direction: 'expense' }))
    journal.add(new Consumption({ occurredAt: at('2026-08-06', 12), nutrients: { calories: 300 } }))
    journal.add(new ActivitySession({ occurredAt: at('2026-08-06', 11), activity: run, quantities: [Quantity.of(45, 'minutes')] }))
    expect(spendingOn(journal, day('2026-08-06'))).toBe(25)
    expect(spendingOn(journal, day('2026-08-05'))).toBe(0)
    expect(caloriesOn(journal, day('2026-08-06'))).toBe(300)
    expect(caloriesOn(journal, day('2026-08-05'))).toBe(0)
    expect(activeMinutesOn(journal, day('2026-08-06'))).toBe(45)
    expect(activeMinutesOn(journal, day('2026-08-05'))).toBe(0)
  })
})
