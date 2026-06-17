import { describe, expect, it } from 'vitest'
import { Money } from '../core/money.js'
import { formatMoney, monthlyTotalLabel } from './money.js'

describe('formatMoney', () => {
  it('uses a symbol for known currencies', () => {
    expect(formatMoney(Money.of(64900, 'USD', 2))).toBe('$649.00')
    expect(formatMoney(Money.of(1000, 'EUR', 2))).toBe('€10.00')
    expect(formatMoney(Money.of(500, 'GBP', 2))).toBe('£5.00')
  })
  it('falls back to a trailing code for unknown currencies and respects exponent', () => {
    expect(formatMoney(Money.of(1000, 'JPY', 0))).toBe('1000 JPY')
  })
  it('renders negatives with the sign before the symbol', () => {
    expect(formatMoney(Money.of(-20000, 'USD', 2))).toBe('-$200.00')
    expect(formatMoney(Money.of(-1000, 'JPY', 0))).toBe('-1000 JPY')
  })
})

describe('monthlyTotalLabel', () => {
  it('returns empty string for no entries', () => {
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
