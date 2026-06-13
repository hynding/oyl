// packages/all-of-oyl/src/vault/subscription.test.ts
import { describe, expect, it } from 'vitest'
import { Subscription } from './subscription.js'
import { Cadence } from '../core/cadence.js'
import { DayKey } from '../core/day-key.js'
import { Id } from '../core/id.js'
import { Money } from '../core/money.js'
import { DomainError } from '../core/domain-error.js'

const day = (s: string) => DayKey.of(s)

function netflix(renewedThrough?: string): Subscription {
  return new Subscription({
    name: 'Netflix',
    amount: Money.usd(1599),
    cadence: Cadence.of(1, 'months'),
    anchor: day('2026-01-15'),
    ...(renewedThrough !== undefined ? { renewedThrough: day(renewedThrough) } : {}),
    category: 'streaming',
  })
}

describe('Subscription', () => {
  it('the pending occurrence is anchor-derived: never renewed → the anchor itself', () => {
    expect(netflix().nextDueOn(day('2026-06-01'))?.value).toBe('2026-01-15')
  })

  it('the cursor advances along anchored occurrences (31st-style anchors never drift)', () => {
    const sub = netflix('2026-05-15')
    expect(sub.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-15')
  })

  it('a lapsed subscription surfaces its overdue occurrence — never skips to next month', () => {
    const gym = new Subscription({
      name: 'Gym',
      amount: Money.usd(4000),
      cadence: Cadence.of(1, 'months'),
      anchor: day('2026-01-01'),
      renewedThrough: day('2026-04-01'),
      category: 'fitness',
    })
    // pending is May 1 even when asked in June — lapsed, visible, honest
    expect(gym.nextDueOn(day('2026-06-01'))?.value).toBe('2026-05-01')
  })

  it('renew() moves the cursor to the pending occurrence and returns a charge for the caller to journal', () => {
    const accountId = Id.of('00000000-0000-4000-8000-000000000032')
    const sub = new Subscription({
      name: 'Netflix',
      amount: Money.usd(1599),
      cadence: Cadence.of(1, 'months'),
      anchor: day('2026-01-15'),
      renewedThrough: day('2026-05-15'),
      category: 'streaming',
      accountId,
    })
    const charge = sub.renew(day('2026-06-16')) // paid a day late
    expect(charge.amount.equals(Money.usd(1599))).toBe(true)
    expect(charge.category).toBe('streaming')
    expect(charge.direction).toBe('expense')
    expect(charge.accountId).toBe(accountId)
    expect(charge.on.value).toBe('2026-06-16')
    // late renewal does NOT drift the schedule: cursor sits on the anchored occurrence
    expect(sub.renewedThrough?.value).toBe('2026-06-15')
    expect(sub.nextDueOn(day('2026-06-16'))?.value).toBe('2026-07-15')
  })

  it('validates construction', () => {
    const base = { name: 'X', amount: Money.usd(100), cadence: Cadence.of(1, 'months'), anchor: day('2026-01-01'), category: 'streaming' }
    const cases: [() => unknown, string][] = [
      [() => new Subscription({ ...base, name: '' }), 'INVALID_QUANTITY'],
      [() => new Subscription({ ...base, amount: Money.usd(0) }), 'INVALID_QUANTITY'],
      [() => new Subscription({ ...base, amount: Money.usd(-100) }), 'INVALID_QUANTITY'],
      [() => new Subscription({ ...base, category: 'two words' }), 'INVALID_SLUG'],
      [() => new Subscription({ ...base, renewedThrough: day('2025-12-01') }), 'INVALID_RANGE'], // cursor before anchor
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

  it('round-trips JSON with unknown fields preserved', () => {
    const sub = new Subscription({
      id: Id.of('00000000-0000-4000-8000-000000002020'),
      name: 'Netflix',
      amount: Money.usd(1599),
      cadence: Cadence.of(1, 'months'),
      anchor: day('2026-01-15'),
      renewedThrough: day('2026-05-15'),
      category: 'streaming',
    })
    const revived = Subscription.fromJSON({ ...sub.toJSON(), futureField: 17 })
    expect(revived.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-15')
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(17)
    expect(Subscription.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: '00000000-0000-4000-8000-000000002020', name: 'X' }, { id: '00000000-0000-4000-8000-000000002020', name: 'X', amount: Money.usd(1).toJSON(), cadence: { n: 1, unit: 'months' }, anchor: 'garbage', category: 'streaming' }]) {
      let caught: unknown
      try {
        Subscription.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
