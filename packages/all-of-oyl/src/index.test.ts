import { describe, expect, it } from 'vitest'
import { ActivitySession, Appointment, Consumption, DayKey, Id, Measurement, Note, PlannedMeal, Task, Transaction, reviveEntry, revivePlan } from './index.js'
import { DomainError } from './core/domain-error.js'

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
    for (const shape of [{ kind: 'sleep-log' }, { kind: 'toString' }, { kind: 'constructor' }, { kind: 'hasOwnProperty' }, {}, null, 42]) {
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

describe('revivePlan', () => {
  it('dispatches every plan kind to the right class', () => {
    const task = new Task({ title: 'File taxes' })
    const appt = new Appointment({ title: 'Dentist', startsAt: when, tz: 'America/New_York' })
    const meal = new PlannedMeal({ title: 'Oatmeal', day: DayKey.of('2026-06-02'), foodId: Id.of('00000000-0000-4000-8000-000000000031') })
    expect(revivePlan(task.toJSON())).toBeInstanceOf(Task)
    expect(revivePlan(appt.toJSON())).toBeInstanceOf(Appointment)
    expect(revivePlan(meal.toJSON())).toBeInstanceOf(PlannedMeal)
  })

  it('throws UNKNOWN_KIND for unregistered kinds, including prototype keys', () => {
    for (const shape of [{ kind: 'reminder' }, { kind: 'toString' }, { kind: 'constructor' }, {}, null, 42]) {
      let caught: unknown
      try {
        revivePlan(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('UNKNOWN_KIND')
    }
  })
})
