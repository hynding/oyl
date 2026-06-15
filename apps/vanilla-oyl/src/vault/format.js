/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */

const SYMBOLS = /** @type {Record<string, string>} */ ({ USD: '$', EUR: '€', GBP: '£' })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Magnitude phrase for a positive day count: "5 days" / "3 weeks" / "2 months". @param {number} n @returns {string} */
function relativeSpan(n) {
  if (n < 14) return `${n} day${n === 1 ? '' : 's'}`
  if (n < 60) return `${Math.round(n / 7)} weeks`
  return `${Math.round(n / 30)} months`
}

/**
 * Relative phrasing for an upcoming (or past) due day: "today" / "tomorrow" /
 * "in 5 days" / "in 3 weeks" / "in 3 months", and past → "yesterday" / "5 days ago".
 * @param {DayKey} due @param {DayKey} today @returns {string}
 */
export function dueInLabel(due, today) {
  const days = Math.round((Date.parse(due.value) - Date.parse(today.value)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  const phrase = relativeSpan(Math.abs(days))
  return days > 0 ? `in ${phrase}` : `${phrase} ago`
}

/** "$649.00" for USD/EUR/GBP, else "<amount> <CUR>"; negatives as "-$200.00". @param {Money} m @returns {string} */
export function formatMoney(m) {
  const neg = m.minor < 0
  const amount = (Math.abs(m.minor) / 10 ** m.exponent).toFixed(m.exponent)
  const sym = SYMBOLS[m.currency]
  const body = sym ? `${sym}${amount}` : `${amount} ${m.currency}`
  return neg ? `-${body}` : body
}

/**
 * "$13.99/mo" for one currency, "£5.00 + $13.99/mo" for several, "" when empty.
 * Sorted by currency code so output is deterministic (the source Map is insertion-ordered).
 * @param {ReadonlyMap<string, Money>} totals @returns {string}
 */
export function monthlyTotalLabel(totals) {
  const parts = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, m]) => formatMoney(m))
  return parts.length === 0 ? '' : `${parts.join(' + ')}/mo`
}

/** "Last contacted 3 months ago" / "Last contacted today" / "Never contacted". @param {number | undefined} days @returns {string} */
export function stalenessLabel(days) {
  if (days === undefined) return 'Never contacted'
  if (days <= 0) return 'Last contacted today'
  if (days === 1) return 'Last contacted yesterday'
  return `Last contacted ${relativeSpan(days)} ago`
}

/** "Jun 20" — month/day only (birthdays ignore the year). @param {DayKey} day @returns {string} */
export function monthDayLabel(day) {
  return `${MONTHS[day.month - 1] ?? ''} ${day.dayOfMonth}`
}
