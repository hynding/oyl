import { describe, expect, it } from 'vitest'
import { DayKey, Money, Transaction } from '@oyl/all-of-oyl'
import {
  CURRENCIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES, accountSpendLabel, budgetLabel, monthHeading, monthTotals,
  signedMoney, transactionLines, transactionValue,
} from './format.js'

const prog = (met: boolean) => ({ current: 0, target: 0, ratio: met ? 0.5 : 1, met, paused: false, empty: false }) as never
const usd = (major: number) => Money.fromMajor(major, 'USD')
const tx = (major: number, direction: 'expense' | 'income', extra: Partial<{ currency: string; note: string; accountId: string }> = {}) =>
  new Transaction({
    occurredAt: new Date('2026-10-08T12:00:00'), amount: Money.fromMajor(major, extra.currency ?? 'USD'), category: 'groceries', direction,
    ...(extra.note ? { note: extra.note } : {}), ...(extra.accountId ? { accountId: extra.accountId as never } : {}),
  })

describe('lists', () => {
  it('match vanilla', () => {
    expect(CURRENCIES).toEqual(['USD', 'EUR', 'GBP'])
    expect(EXPENSE_CATEGORIES).toEqual(['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other'])
    expect(INCOME_CATEGORIES).toEqual(['salary', 'freelance', 'gift', 'refund', 'other'])
  })
})

describe('budgetLabel', () => {
  it('shows spent/limit and remaining when under budget', () => {
    expect(budgetLabel(prog(true), usd(1800), usd(2200))).toBe('$1800.00 of $2200.00 · $400.00 left')
  })
  it('shows over-by when over budget', () => {
    expect(budgetLabel(prog(false), usd(2300), usd(2200))).toBe('$2300.00 of $2200.00 · over by $100.00')
  })
})

describe('accountSpendLabel', () => {
  it('formats the money with a "this month" suffix', () => {
    expect(accountSpendLabel(usd(65))).toBe('$65.00 this month')
    expect(accountSpendLabel(usd(0))).toBe('$0.00 this month')
  })
})

describe('monthHeading', () => {
  it('full month name and year', () => {
    expect(monthHeading(DayKey.of('2026-10-08'))).toBe('October 2026')
    expect(monthHeading(DayKey.of('2026-01-31'))).toBe('January 2026')
  })
})

describe('signedMoney', () => {
  it('always carries its own sign and never double-signs', () => {
    expect(signedMoney(usd(5))).toBe('+$5.00')
    expect(signedMoney(usd(0).subtract(usd(5)))).toBe('−$5.00')
    expect(signedMoney(usd(0))).toBe('$0.00')
  })
})

describe('transactionValue', () => {
  it('signs by direction', () => {
    expect(transactionValue(tx(100, 'income'))).toBe('+$100.00')
    expect(transactionValue(tx(12.34, 'expense'))).toBe('−$12.34')
  })
})

describe('transactionLines', () => {
  const names = new Map([['a1', 'Checking']])
  it('month-day, account name and note', () => {
    expect(transactionLines(tx(1, 'expense', { accountId: 'a1', note: 'weekly shop' }), names, 'UTC')).toEqual(['Oct 8 · Checking', 'weekly shop'])
    expect(transactionLines(tx(1, 'expense'), names, 'UTC')).toEqual(['Oct 8', undefined])
  })
})

describe('monthTotals', () => {
  it('sums spent and income per currency, most-used currency first, net signed', () => {
    const totals = monthTotals([tx(10, 'expense'), tx(30, 'income'), tx(5, 'expense', { currency: 'EUR' }), tx(2.5, 'expense')])
    expect(totals.map((t) => t.currency)).toEqual(['USD', 'EUR'])
    expect(totals[0].spent.minor).toBe(1250)
    expect(totals[0].income.minor).toBe(3000)
    expect(totals[0].net.minor).toBe(1750)
    expect(totals[1].net.minor).toBe(-500)
  })
  it('is empty without transactions', () => {
    expect(monthTotals([])).toEqual([])
  })
})
