import type { DayKey } from '../core/day-key.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Today"/"Yesterday"/"Tomorrow" relative to `today`, else "". */
export function relativeDayLabel(day: DayKey, today: DayKey): string {
  if (day.equals(today)) return 'Today'
  if (day.equals(today.addDays(-1))) return 'Yesterday'
  if (day.equals(today.addDays(1))) return 'Tomorrow'
  return ''
}

/** "Wednesday, Jun 10" from a DayKey. */
export function formatDayHeading(day: DayKey): string {
  return `${WEEKDAYS[day.weekday() - 1] ?? ''}, ${MONTHS[day.month - 1] ?? ''} ${day.dayOfMonth}`
}

/** "Jun 20" — month/day only (birthdays ignore the year). */
export function monthDayLabel(day: DayKey): string {
  return `${MONTHS[day.month - 1] ?? ''} ${day.dayOfMonth}`
}

/** Locale clock time (HH:MM) for an instant. */
export function formatClockTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** Positive-day-count magnitude: "5 days" / "3 weeks" / "2 months". */
export function spanLabel(n: number): string {
  if (n < 14) return `${n} day${n === 1 ? '' : 's'}`
  if (n < 60) return `${Math.round(n / 7)} weeks`
  return `${Math.round(n / 30)} months`
}

/**
 * "today"/"tomorrow"/"yesterday"/"in 5 days"/"in 3 weeks"/"in 3 months", and
 * past → "yesterday"/"5 days ago".
 */
export function dueInLabel(due: DayKey, today: DayKey): string {
  const days = Math.round((Date.parse(due.value) - Date.parse(today.value)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  const phrase = spanLabel(Math.abs(days))
  return days > 0 ? `in ${phrase}` : `${phrase} ago`
}
