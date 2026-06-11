import { describe, expect, it } from 'vitest'
import { Money } from './money'
import { DomainError } from './domain-error'

describe('Money', () => {
  it('stores integer minor units; usd factory', () => {
    const m = Money.usd(4210)
    expect(m.minor).toBe(4210)
    expect(m.currency).toBe('USD')
    expect(m.exponent).toBe(2)
    expect(m.toNumber()).toBe(42.1)
  })

  it('supports exponent-0 currencies', () => {
    const yen = Money.of(500, 'JPY', 0)
    expect(yen.toNumber()).toBe(500)
  })

  it('allows negative amounts (refunds)', () => {
    expect(Money.usd(-1500).toNumber()).toBe(-15)
    expect(Money.usd(2000).add(Money.usd(-1500)).minor).toBe(500)
  })

  it('adds and subtracts matching currency', () => {
    expect(Money.usd(100).add(Money.usd(50)).minor).toBe(150)
    expect(Money.usd(100).subtract(Money.usd(50)).minor).toBe(50)
  })

  it('rejects cross-currency arithmetic with CURRENCY_MISMATCH', () => {
    let caught: unknown
    try {
      Money.usd(100).add(Money.of(100, 'EUR'))
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('CURRENCY_MISMATCH')
  })

  it('rejects non-integer minor units', () => {
    let caught: unknown
    try {
      Money.of(10.5, 'USD')
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('equals by value and round-trips JSON', () => {
    expect(Money.usd(4210).equals(Money.of(4210, 'USD', 2))).toBe(true)
    const shape = Money.usd(4210).toJSON()
    expect(shape).toEqual({ minor: 4210, currency: 'USD', exponent: 2 })
    expect(Money.fromJSON(shape).equals(Money.usd(4210))).toBe(true)
  })

  it('reconstructs exact Money from a major-unit float (Budget seam)', () => {
    expect(Money.fromMajor(42.1, 'USD', 2).minor).toBe(4210)
    expect(Money.fromMajor(0.30000000000000004, 'USD', 2).minor).toBe(30)
  })

  it.each([null, 42, {}, { minor: 100 }, { minor: 100, currency: 'USD' }, { minor: '100', currency: 'USD', exponent: 2 }])(
    'fromJSON rejects malformed shape %j with MALFORMED_JSON',
    (shape) => {
      let caught: unknown
      try {
        Money.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    },
  )
})
