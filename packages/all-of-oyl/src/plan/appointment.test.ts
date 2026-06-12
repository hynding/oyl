import { describe, expect, it } from 'vitest'
import { Appointment } from './appointment'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

describe('Appointment', () => {
  it('derives its due day from startsAt + explicit timezone', () => {
    // 01:30Z on June 3 is the evening of June 2 in New York
    const appt = new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-03T01:30:00Z'), tz: 'America/New_York', durationMinutes: 45 })
    expect(appt.kind).toBe('appointment')
    expect(appt.due?.value).toBe('2026-06-02')
    expect(appt.durationMinutes).toBe(45)
    expect(appt.startsAt.toISOString()).toBe('2026-06-03T01:30:00.000Z')
  })

  it('defends startsAt against mutation and validates inputs', () => {
    const at = new Date('2026-06-03T15:00:00Z')
    const appt = new Appointment({ title: 'Dentist', startsAt: at, tz: 'America/New_York' })
    at.setUTCFullYear(1999)
    expect(appt.startsAt.getUTCFullYear()).toBe(2026)

    let caught1: unknown
    try {
      new Appointment({ title: 'Dentist', startsAt: new Date(), tz: 'Bad/Zone' })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_TIMEZONE')

    let caught2: unknown
    try {
      new Appointment({ title: 'Dentist', startsAt: new Date(), tz: 'America/New_York', durationMinutes: -30 })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_QUANTITY')

    let caught3: unknown
    try {
      new Appointment({ title: 'Dentist', startsAt: new Date() }) // neither tz nor precomputed due
    } catch (e) {
      caught3 = e
    }
    expect((caught3 as DomainError)?.code).toBe('INVALID_TIMEZONE')
  })

  it('round-trips JSON without needing the timezone again', () => {
    const appt = new Appointment({
      id: Id.of('00000000-0000-4000-8000-000000001006'),
      title: 'Dentist',
      startsAt: new Date('2026-06-03T15:00:00Z'),
      tz: 'America/New_York',
      durationMinutes: 45,
    })
    const revived = Appointment.fromJSON({ ...appt.toJSON(), futureField: 10 })
    expect(revived.due?.value).toBe('2026-06-03')
    expect(revived.startsAt.toISOString()).toBe('2026-06-03T15:00:00.000Z')
    expect(revived.durationMinutes).toBe(45)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(10)
    expect(Appointment.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    let caught: unknown
    try {
      Appointment.fromJSON({ kind: 'appointment', id: '00000000-0000-4000-8000-000000001006', title: 'x', status: 'open' }) // no startsAt
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })
})
