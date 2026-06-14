/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */

const SYMBOLS = /** @type {Record<string, string>} */ ({ USD: '$', EUR: '€', GBP: '£' })

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
  const n = Math.abs(days)
  const phrase = n < 14 ? `${n} days` : n < 60 ? `${Math.round(n / 7)} weeks` : `${Math.round(n / 30)} months`
  return days > 0 ? `in ${phrase}` : `${phrase} ago`
}

/** "$649.00" for USD/EUR/GBP, else "<amount> <CUR>". @param {Money} m @returns {string} */
export function formatMoney(m) {
  const amount = (m.minor / 10 ** m.exponent).toFixed(m.exponent)
  const sym = SYMBOLS[m.currency]
  return sym ? `${sym}${amount}` : `${amount} ${m.currency}`
}
