import type { Money } from '../core/money.js'

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }

/** "$649.00" for USD/EUR/GBP, else "<amount> <CUR>"; negatives as "-$200.00". */
export function formatMoney(m: Money): string {
  const neg = m.minor < 0
  const amount = (Math.abs(m.minor) / 10 ** m.exponent).toFixed(m.exponent)
  const sym = SYMBOLS[m.currency]
  const body = sym ? `${sym}${amount}` : `${amount} ${m.currency}`
  return neg ? `-${body}` : body
}

/**
 * "$13.99/mo" for one currency, "£5.00 + $13.99/mo" for several, "" when empty.
 * Sorted by currency code so output is deterministic.
 */
export function monthlyTotalLabel(totals: ReadonlyMap<string, Money>): string {
  const parts = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, m]) => formatMoney(m))
  return parts.length === 0 ? '' : `${parts.join(' + ')}/mo`
}
