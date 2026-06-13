/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Today"/"Yesterday"/"Tomorrow" relative to `today`, else "". @param {DayKey} day @param {DayKey} today @returns {string} */
export function relativeDayLabel(day, today) {
  if (day.equals(today)) return 'Today'
  if (day.equals(today.addDays(-1))) return 'Yesterday'
  if (day.equals(today.addDays(1))) return 'Tomorrow'
  return ''
}

/** "Wednesday, Jun 10" from a DayKey (value is "YYYY-MM-DD"). @param {DayKey} day @returns {string} */
export function formatDayHeading(day) {
  const parts = day.value.split('-')
  const month = Number(parts[1])
  const dom = Number(parts[2])
  return `${WEEKDAYS[day.weekday() - 1] ?? ''}, ${MONTHS[month - 1] ?? ''} ${dom}`
}

/** Locale clock time (HH:MM) for an instant. @param {Date} date @returns {string} */
export function formatClockTime(date) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** Display unit for known measurement metric keys ("" when unknown). @param {string} metric @returns {string} */
export function measurementUnit(metric) {
  const units = /** @type {Record<string, string>} */ ({
    'body.weight_kg': 'kg',
    'sleep.hours': 'h',
    'screen.minutes': 'min',
  })
  return units[metric] ?? ''
}
