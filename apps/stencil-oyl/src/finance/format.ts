import { Money, DayKey, type GoalProgress, type Transaction } from '@oyl/all-of-oyl'
import { formatMoney, monthDayLabel } from '@oyl/all-of-oyl/format'

export const CURRENCIES: readonly string[] = ['USD', 'EUR', 'GBP']
export const EXPENSE_CATEGORIES: readonly string[] = ['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other']
export const INCOME_CATEGORIES: readonly string[] = ['salary', 'freelance', 'gift', 'refund', 'other']

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "October 2026" — `/format` has only a short month table, so this stays app-side. */
export function monthHeading(day: DayKey): string {
  return `${MONTHS[day.month - 1] ?? ''} ${day.year}`
}

/** "$1800.00 of $2200.00 · $400.00 left" (under) / "… · over by $100.00" (over) — vanilla's rule. */
export function budgetLabel(progress: GoalProgress, spent: Money, limit: Money): string {
  const base = `${formatMoney(spent)} of ${formatMoney(limit)}`
  return progress.met === false ? `${base} · over by ${formatMoney(spent.subtract(limit))}` : `${base} · ${formatMoney(limit.subtract(spent))} left`
}

/** "$65.00 this month". */
export function accountSpendLabel(spent: Money): string {
  return `${formatMoney(spent)} this month`
}

/** "+$5.00" / "−$5.00" / "$0.00": its own sign over the unsigned amount (formatMoney signs negatives itself). */
export function signedMoney(m: Money): string {
  const abs = Money.of(Math.abs(m.minor), m.currency, m.exponent)
  return m.minor > 0 ? `+${formatMoney(abs)}` : m.minor < 0 ? `−${formatMoney(abs)}` : formatMoney(abs)
}

/** The ledger row's value: "+$100.00" for income, "−$12.34" for an expense. */
export function transactionValue(tx: Transaction): string {
  return `${tx.direction === 'income' ? '+' : '−'}${formatMoney(tx.amount)}`
}

/** The ledger row's lines: "Oct 8 · Checking" (account name when known) and the note. */
export function transactionLines(tx: Transaction, namesById: ReadonlyMap<string, string>, tz: string): readonly (string | undefined)[] {
  const name = tx.accountId !== undefined ? namesById.get(tx.accountId) : undefined
  return [`${monthDayLabel(DayKey.from(tx.occurredAt, tz))}${name ? ` · ${name}` : ''}`, tx.note]
}

export interface MonthTotal {
  currency: string
  spent: Money
  income: Money
  net: Money
}

/** Spent / income / net per currency (never summed across), most-used currency first. */
export function monthTotals(txs: readonly Transaction[]): MonthTotal[] {
  const by = new Map<string, { spent: Money; income: Money; count: number }>()
  for (const tx of txs) {
    const cur = tx.amount.currency
    const t = by.get(cur) ?? { spent: Money.of(0, cur, tx.amount.exponent), income: Money.of(0, cur, tx.amount.exponent), count: 0 }
    if (tx.direction === 'income') t.income = t.income.add(tx.amount)
    else t.spent = t.spent.add(tx.amount)
    t.count += 1
    by.set(cur, t)
  }
  return [...by.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([currency, t]) => ({ currency, spent: t.spent, income: t.income, net: t.income.subtract(t.spent) }))
}
