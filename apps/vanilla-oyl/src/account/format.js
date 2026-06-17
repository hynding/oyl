import { formatMoney } from '@oyl/all-of-oyl/format'

/** @typedef {import('@oyl/all-of-oyl').Money} Money */

/** "$65.00 this month". @param {Money} spent @returns {string} */
export function accountSpendLabel(spent) {
  return `${formatMoney(spent)} this month`
}
