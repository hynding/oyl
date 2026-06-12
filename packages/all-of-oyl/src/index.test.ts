import { describe, expect, it } from 'vitest'
import { ActivitySession, Consumption, Measurement, Note, Transaction, reviveEntry } from './index'
import { DomainError } from './core/domain-error'

const when = new Date('2026-06-01T12:00:00Z')

describe('reviveEntry', () => {
  it('dispatches every entry kind to the right class', () => {
    const samples = [
      new Measurement({ occurredAt: when, metric: 'body.weight_kg', value: 80 }),
      new Note({ occurredAt: when, text: 'hello' }),
    ]
    const revived = samples.map((e) => reviveEntry(e.toJSON()))
    expect(revived[0]).toBeInstanceOf(Measurement)
    expect(revived[1]).toBeInstanceOf(Note)
    // classes with definitions, via raw shapes
    expect(
      reviveEntry({
        kind: 'activity-session',
        id: '00000000-0000-4000-8000-000000000100',
        occurredAt: when.toISOString(),
        activityId: '00000000-0000-4000-8000-000000000030',
        slug: 'run',
      }),
    ).toBeInstanceOf(ActivitySession)
    expect(
      reviveEntry({
        kind: 'consumption',
        id: '00000000-0000-4000-8000-000000000101',
        occurredAt: when.toISOString(),
        servings: 1,
        nutrients: { calories: 100 },
      }),
    ).toBeInstanceOf(Consumption)
    expect(
      reviveEntry({
        kind: 'transaction',
        id: '00000000-0000-4000-8000-000000000102',
        occurredAt: when.toISOString(),
        amount: { minor: 100, currency: 'USD', exponent: 2 },
        category: 'groceries',
        direction: 'expense',
      }),
    ).toBeInstanceOf(Transaction)
  })

  it('throws UNKNOWN_KIND for unregistered kinds — louder than dropping data', () => {
    for (const shape of [{ kind: 'sleep-log' }, {}, null, 42]) {
      let caught: unknown
      try {
        reviveEntry(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('UNKNOWN_KIND')
    }
  })
})
