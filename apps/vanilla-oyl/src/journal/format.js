/** Display unit for known measurement metric keys ("" when unknown). @param {string} metric @returns {string} */
export function measurementUnit(metric) {
  const units = /** @type {Record<string, string>} */ ({
    'body.weight_kg': 'kg',
    'sleep.hours': 'h',
    'screen.minutes': 'min',
  })
  return units[metric] ?? ''
}
