import { describe, expect, it } from 'vitest'
import { DayPlan, type DayPlanSlot } from './day-plan.js'
import { DayKey } from '../core/day-key.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

const day = (s: string) => DayKey.of(s)
const pid = (n: number) => Id.of(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)

describe('DayPlan', () => {
  it('holds ordered, optionally time-boxed slots for one day', () => {
    const plan = new DayPlan({
      day: day('2026-06-01'),
      slots: [
        { planId: pid(1003), start: '09:00', end: '10:00' },
        { planId: pid(1006) },
      ],
    })
    expect(plan.day.value).toBe('2026-06-01')
    expect(plan.slots).toHaveLength(2)
    expect(plan.slots[0]?.start).toBe('09:00')
    expect(Id.of(plan.id)).toBe(plan.id)
  })

  it('validates time boxes: format, end-requires-start, end-after-start', () => {
    const cases: [{ planId: Id; start?: string; end?: string }, string][] = [
      [{ planId: pid(1), start: '9:00' }, 'INVALID_QUANTITY'],
      [{ planId: pid(1), start: '24:00' }, 'INVALID_QUANTITY'],
      [{ planId: pid(1), end: '10:00' }, 'INVALID_RANGE'],
      [{ planId: pid(1), start: '10:00', end: '10:00' }, 'INVALID_RANGE'],
      [{ planId: pid(1), start: '11:00', end: '10:00' }, 'INVALID_RANGE'],
    ]
    for (const [slot, code] of cases) {
      let caught: unknown
      try {
        new DayPlan({ day: day('2026-06-01'), slots: [slot] })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe(code)
    }
  })

  it('slots are defensively copied from the input', () => {
    const slots: DayPlanSlot[] = [{ planId: pid(1003), start: '09:00' }]
    const plan = new DayPlan({ day: day('2026-06-01'), slots })
    slots.pop()
    expect(plan.slots).toHaveLength(1)
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const plan = new DayPlan({
      id: Id.of('00000000-0000-4000-8000-000000001010'),
      day: day('2026-06-01'),
      slots: [{ planId: pid(1003), start: '09:00', end: '10:00' }],
    })
    const revived = DayPlan.fromJSON({ ...plan.toJSON(), futureField: 13 })
    expect(revived.day.value).toBe('2026-06-01')
    expect(revived.slots[0]?.end).toBe('10:00')
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(13)
    expect(DayPlan.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      null,
      { id: '00000000-0000-4000-8000-000000001010', day: '2026-06-01' }, // no slots
      { id: '00000000-0000-4000-8000-000000001010', day: 'garbage', slots: [] },
      { id: '00000000-0000-4000-8000-000000001010', day: '2026-06-01', slots: [{ planId: 'nope' }] },
    ]) {
      let caught: unknown
      try {
        DayPlan.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
