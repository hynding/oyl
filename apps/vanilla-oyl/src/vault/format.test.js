import { describe, expect, it } from 'vitest'
import { DayKey, Money } from '@oyl/all-of-oyl'
import { dueInLabel, formatMoney, monthlyTotalLabel } from './format.js'

const today = DayKey.of('2026-06-13')

describe('dueInLabel', () => {
  it('phrases near and far future days', () => {
    expect(dueInLabel(today, today)).toBe('today')
    expect(dueInLabel(today.addDays(1), today)).toBe('tomorrow')
    expect(dueInLabel(today.addDays(5), today)).toBe('in 5 days')
    expect(dueInLabel(today.addDays(21), today)).toBe('in 3 weeks')
    expect(dueInLabel(today.addDays(90), today)).toBe('in 3 months')
  })
  it('phrases past days (overdue renewals)', () => {
    expect(dueInLabel(today.addDays(-1), today)).toBe('yesterday')
    expect(dueInLabel(today.addDays(-5), today)).toBe('5 days ago')
  })
})

describe('formatMoney', () => {
  it('uses a symbol for known currencies', () => {
    expect(formatMoney(Money.of(64900, 'USD', 2))).toBe('$649.00')
    expect(formatMoney(Money.of(1000, 'EUR', 2))).toBe('€10.00')
    expect(formatMoney(Money.of(500, 'GBP', 2))).toBe('£5.00')
  })
  it('falls back to a trailing code for unknown currencies and respects exponent', () => {
    expect(formatMoney(Money.of(1000, 'JPY', 0))).toBe('1000 JPY')
  })
})

describe('monthlyTotalLabel', () => {
  it('returns empty string for no subscriptions', () => {
    expect(monthlyTotalLabel(new Map())).toBe('')
  })
  it('formats a single currency', () => {
    expect(monthlyTotalLabel(new Map([['USD', Money.of(1399, 'USD', 2)]]))).toBe('$13.99/mo')
  })
  it('sorts multiple currencies by code regardless of insertion order', () => {
    const totals = new Map([['USD', Money.of(1399, 'USD', 2)], ['GBP', Money.of(500, 'GBP', 2)]])
    expect(monthlyTotalLabel(totals)).toBe('£5.00 + $13.99/mo')
  })
})
