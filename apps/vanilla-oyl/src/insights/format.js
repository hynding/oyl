/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */

/** "$42.50" (major-unit, single-currency). @param {number} n @returns {string} */
export function money(n) {
  return `$${n.toFixed(2)}`
}

/** A goal's review label from its progress alone (GoalReview lacks direction/unit). @param {GoalProgress} p @returns {string} */
export function reviewGoalLabel(p) {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data'
  if (p.met === true) return 'Met'
  return `${Math.round(p.ratio * 100)}%`
}
