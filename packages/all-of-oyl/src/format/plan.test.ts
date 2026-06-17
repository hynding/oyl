import { describe, expect, it } from 'vitest'
import { Cadence } from '../core/cadence.js'
import { Appointment } from '../plan/appointment.js'
import { cadenceLabel, appointmentTime } from './plan.js'

describe('cadenceLabel', () => {
  it('singular for n=1, plural otherwise', () => {
    expect(cadenceLabel(Cadence.of(1, 'weeks'))).toBe('every week')
    expect(cadenceLabel(Cadence.of(1, 'days'))).toBe('every day')
    expect(cadenceLabel(Cadence.of(2, 'weeks'))).toBe('every 2 weeks')
    expect(cadenceLabel(Cadence.of(3, 'months'))).toBe('every 3 months')
  })
})

describe('appointmentTime', () => {
  it('clock time, with duration suffix when set', () => {
    const a = new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-16T15:00:00'), durationMinutes: 60, tz: 'America/New_York' })
    expect(appointmentTime(a)).toMatch(/\d{1,2}:\d{2}.*·.*60m/)
    const b = new Appointment({ title: 'Quick', startsAt: new Date('2026-06-16T09:00:00'), tz: 'America/New_York' })
    expect(appointmentTime(b)).toMatch(/^\d{1,2}:\d{2}/)
    expect(appointmentTime(b)).not.toContain('·')
  })
})
