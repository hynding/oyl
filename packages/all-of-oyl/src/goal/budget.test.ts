import { describe, expect, it } from 'vitest'
import { Budget } from './budget'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { Journal } from '../core/journal'
import { Money } from '../core/money'
import { Transaction } from '../finance/transaction'
import { DomainError } from '../core/domain-error'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)

function journalWithSpending(): Journal {
  const j = new Journal(NY)
  j.add(new Transaction({ occurredAt: new Date('2026-06-03T18:00:00Z'), amount: Money.usd(6550), category: 'groceries', direction: 'expense' }))
  j.add(new Transaction({ occurredAt: new Date('2026-06-10T18:00:00Z'), amount: Money.usd(8000), category: 'groceries', direction: 'expense' }))
  j.add(new Transaction({ occurredAt: new Date('2026-06-12T18:00:00Z'), amount: Money.usd(-1500), category: 'groceries', direction: 'expense' })) // refund
  j.add(new Transaction({ occurredAt: new Date('2026-06-12T19:00:00Z'), amount: Money.usd(9999), category: 'dining', direction: 'expense' })) // other category
  j.add(new Transaction({ occurredAt: new Date('2026-07-01T18:00:00Z'), amount: Money.usd(5000), category: 'groceries', direction: 'expense' })) // next month
  return j
}

describe('Budget', () => {
  it('constructs with category, limit, and validates', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    expect(budget.category).toBe('groceries')
    expect(budget.limit.equals(Money.usd(40000))).toBe(true)
    expect(Id.of(budget.id)).toBe(budget.id)

    const cases: [() => unknown, string][] = [
      [() => new Budget({ category: 'two words', limit: Money.usd(40000) }), 'INVALID_SLUG'],
      [() => new Budget({ category: 'groceries', limit: Money.usd(0) }), 'INVALID_QUANTITY'],
      [() => new Budget({ category: 'groceries', limit: Money.usd(-100) }), 'INVALID_QUANTITY'],
    ]
    for (const [build, code] of cases) {
      let caught: unknown
      try {
        build()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe(code)
    }
  })

  it('spent is net-of-refunds, exact Money, scoped to category and month', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    const spent = budget.spent(journalWithSpending(), day('2026-06-15'))
    expect(spent.equals(Money.usd(6550 + 8000 - 1500))).toBe(true) // 130.50, exact
  })

  it('remaining = limit − spent', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    const remaining = budget.remaining(journalWithSpending(), day('2026-06-15'))
    expect(remaining.equals(Money.usd(40000 - 13050))).toBe(true)
  })

  it('progress delegates to the goal engine (atMost month, allowance ratio)', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    const p = budget.progressOn(journalWithSpending(), day('2026-06-15'))
    expect(p.current).toBeCloseTo(130.5)
    expect(p.target).toBe(400)
    expect(p.met).toBe(true)
    expect(p.ratio).toBeCloseTo(130.5 / 400)
  })

  it('an empty month is vacuous success — no transactions really is under budget', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    const p = budget.progressOn(new Journal(NY), day('2026-06-15'))
    expect(p.empty).toBe(true)
    expect(p.met).toBe(true)
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const budget = new Budget({ id: Id.of('00000000-0000-4000-8000-000000000060'), name: 'Food money', category: 'groceries', limit: Money.usd(40000) })
    const revived = Budget.fromJSON({ ...budget.toJSON(), futureField: 8 })
    expect(revived.name).toBe('Food money')
    expect(revived.limit.equals(Money.usd(40000))).toBe(true)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(8)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: '00000000-0000-4000-8000-000000000060', category: 'groceries' }, { id: 'nope', category: 'groceries', limit: Money.usd(1).toJSON() }]) {
      let caught: unknown
      try {
        Budget.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
