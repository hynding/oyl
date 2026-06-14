/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').AreaRollup} AreaRollup */

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

/** "2/3 goals · 120 min · 1 project" from the present parts; "Nothing tracked" when all empty. @param {AreaRollup} a @returns {string} */
export function areaStatsLabel(a) {
  const parts = []
  if (a.goalsTotal > 0) parts.push(`${a.goalsMet}/${a.goalsTotal} goals`)
  if (a.activityMinutes > 0) parts.push(`${Math.round(a.activityMinutes)} min`)
  if (a.projectsTouched > 0) parts.push(`${a.projectsTouched} project${a.projectsTouched === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'Nothing tracked'
}
