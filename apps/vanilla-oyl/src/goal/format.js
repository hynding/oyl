/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').GoalDirection} GoalDirection */

const UNITS = /** @type {Record<string, string>} */ ({ 'sleep.hours': 'h', 'body.weight_kg': 'kg', 'nutrition.calories': 'kcal', 'activity.run.minutes': 'min', 'screen.minutes': 'min' })

/** Display unit for a goal metric ("" when unknown). @param {string} metric @returns {string} */
export function metricUnit(metric) {
  return UNITS[metric] ?? ''
}

/** Compact number: integer as-is, else 1 decimal. @param {number} n @returns {string} */
function compact(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/**
 * Progress text honoring direction + state (paused/empty take precedence).
 * atLeast → "12 / 20 h"; atMost → "1800 of 2200 kcal used".
 * @param {GoalProgress} p @param {GoalDirection} direction @param {string} unit @returns {string}
 */
export function goalProgressLabel(p, direction, unit) {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data this period'
  const u = unit ? ` ${unit}` : ''
  return direction === 'atMost' ? `${compact(p.current)} of ${compact(p.target)}${u} used` : `${compact(p.current)} / ${compact(p.target)}${u}`
}
