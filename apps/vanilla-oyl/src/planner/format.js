import { formatClockTime } from '../journal/format.js'

/** @typedef {import('@oyl/all-of-oyl').Cadence} Cadence */
/** @typedef {import('@oyl/all-of-oyl').Appointment} Appointment */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "every week" / "every 2 weeks". @param {Cadence} c @returns {string} */
export function cadenceLabel(c) {
  return c.n === 1 ? `every ${c.unit.slice(0, -1)}` : `every ${c.n} ${c.unit}`
}

/** Clock time, plus "· Nm" when a duration is set. @param {Appointment} appt @returns {string} */
export function appointmentTime(appt) {
  const base = formatClockTime(appt.startsAt)
  return appt.durationMinutes !== undefined ? `${base} · ${appt.durationMinutes}m` : base
}

/** "Due Jun 13 · 3d ago" for an overdue plan. @param {DayKey} due @param {DayKey} today @returns {string} */
export function overdueBadge(due, today) {
  const parts = due.value.split('-')
  const short = `${MONTHS[Number(parts[1]) - 1] ?? ''} ${Number(parts[2])}`
  const days = Math.round((Date.parse(today.value) - Date.parse(due.value)) / 86400000)
  return `Due ${short} · ${days}d ago`
}
