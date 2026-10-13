import { formatMoney } from '@oyl/all-of-oyl/format'

/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */

/** "$1800.00 of $2200.00 · $400.00 left" (under) / "… · over by $100.00" (over). @param {GoalProgress} progress @param {Money} spent @param {Money} limit @returns {string} */
export function budgetLabel(progress, spent, limit) {
  const base = `${formatMoney(spent)} of ${formatMoney(limit)}`
  return progress.met === false
    ? `${base} · over by ${formatMoney(spent.subtract(limit))}`
    : `${base} · ${formatMoney(limit.subtract(spent))} left`
}
