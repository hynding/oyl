import { describe, expect, it } from 'vitest'
import { coerceNumeric } from '../src/utils/coerce'
import { sanitizeMoney, AMOUNT_POPULATE, LIMIT_POPULATE } from '../src/utils/finance-money'

/**
 * Pure-function unit tests for coerceNumeric (shared util) and finance-money helpers.
 * No Strapi boot required.
 */
describe('coerceNumeric', () => {
  it("coerces a numeric string '150' to the number 150", () => {
    expect(coerceNumeric('150')).toBe(150)
    expect(typeof coerceNumeric('150')).toBe('number')
  })

  it('preserves the number 0 as-is (not stripped)', () => {
    expect(coerceNumeric(0)).toBe(0)
    expect(typeof coerceNumeric(0)).toBe('number')
  })

  it("coerces '0' string to the number 0", () => {
    expect(coerceNumeric('0')).toBe(0)
    expect(typeof coerceNumeric('0')).toBe('number')
  })

  it("passes through a non-numeric string 'abc' unchanged", () => {
    expect(coerceNumeric('abc')).toBe('abc')
    expect(typeof coerceNumeric('abc')).toBe('string')
  })

  it('preserves a fractional number 12.5 as-is', () => {
    expect(coerceNumeric(12.5)).toBe(12.5)
    expect(typeof coerceNumeric(12.5)).toBe('number')
  })
})

describe('sanitizeMoney', () => {
  it('coerces minor from string to number on a positive amount', () => {
    const row = { amount: { minor: '1500', currency: 'USD', exponent: 2 } }
    const result = sanitizeMoney(row, 'amount')
    const money = result['amount'] as Record<string, unknown>
    expect(money['minor']).toBe(1500)
    expect(typeof money['minor']).toBe('number')
    expect(money['currency']).toBe('USD')
    expect(money['exponent']).toBe(2)
  })

  it('coerces a negative minor string to a negative number', () => {
    const row = { amount: { minor: '-1500', currency: 'USD', exponent: 2 } }
    const result = sanitizeMoney(row, 'amount')
    const money = result['amount'] as Record<string, unknown>
    expect(money['minor']).toBe(-1500)
    expect(typeof money['minor']).toBe('number')
  })

  it('leaves currency and exponent untouched', () => {
    const row = { amount: { minor: '100', currency: 'GBP', exponent: 2 } }
    const result = sanitizeMoney(row, 'amount')
    const money = result['amount'] as Record<string, unknown>
    expect(money['currency']).toBe('GBP')
    expect(money['exponent']).toBe(2)
  })

  it('returns row unchanged when the money field is null', () => {
    const row = { limit: null }
    const result = sanitizeMoney(row as Record<string, unknown>, 'limit')
    expect(result).toEqual(row)
    expect(result).toBe(row) // same reference (no mutation)
  })

  it('returns row unchanged when the money field is absent', () => {
    const row = { name: 'no-money' }
    const result = sanitizeMoney(row, 'limit')
    expect(result).toEqual(row)
    expect(result).toBe(row) // same reference
  })

  it('does not mutate an unrelated field on the row', () => {
    const row = { amount: { minor: '500', currency: 'EUR', exponent: 2 }, other: 'untouched' }
    const result = sanitizeMoney(row, 'amount')
    expect(result['other']).toBe('untouched')
  })
})

describe('populate constants', () => {
  it('AMOUNT_POPULATE is { amount: true }', () => {
    expect(AMOUNT_POPULATE).toEqual({ amount: true })
  })

  it('LIMIT_POPULATE is { limit: true }', () => {
    expect(LIMIT_POPULATE).toEqual({ limit: true })
  })
})
