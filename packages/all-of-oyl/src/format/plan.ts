import type { Cadence } from '../core/cadence.js'
import type { Appointment } from '../plan/appointment.js'
import { formatClockTime } from './day.js'

/** "every week" / "every 2 weeks". */
export function cadenceLabel(c: Cadence): string {
  return c.n === 1 ? `every ${c.unit.slice(0, -1)}` : `every ${c.n} ${c.unit}`
}

/** Clock time, plus "· Nm" when a duration is set. */
export function appointmentTime(appt: Appointment): string {
  const base = formatClockTime(appt.startsAt)
  return appt.durationMinutes !== undefined ? `${base} · ${appt.durationMinutes}m` : base
}
