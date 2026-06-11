import { describe, expect, it } from 'vitest'
import { Quantity } from './quantity'
import { DomainError } from './domain-error'

describe('Quantity', () => {
  it('holds an amount and a unit', () => {
    const q = Quantity.of(30, 'min')
    expect(q.amount).toBe(30)
    expect(q.unit).toBe('min')
  })

  it('adds matching units', () => {
    expect(Quantity.of(30, 'min').add(Quantity.of(15, 'min')).amount).toBe(45)
  })

  it('rejects mismatched units with UNIT_MISMATCH', () => {
    let caught: unknown
    try {
      Quantity.of(30, 'min').add(Quantity.of(2, 'km'))
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('UNIT_MISMATCH')
  })

  it('rejects non-finite amounts and invalid units', () => {
    for (const bad of [NaN, Infinity]) {
      let caught: unknown
      try {
        Quantity.of(bad, 'min')
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
    let caught: unknown
    try {
      Quantity.of(1, '')
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('equals by value and serializes', () => {
    expect(Quantity.of(2, 'servings').equals(Quantity.of(2, 'servings'))).toBe(true)
    expect(Quantity.of(2, 'servings').toJSON()).toEqual({ amount: 2, unit: 'servings' })
    expect(Quantity.fromJSON({ amount: 2, unit: 'servings' }).amount).toBe(2)
  })
})
