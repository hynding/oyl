import { describe, expect, it } from 'vitest'
import { sanitizeFacts } from '../src/utils/nutrition-facts'

/**
 * Pure-function unit tests for sanitizeFacts — no Strapi boot required.
 */
describe('sanitizeFacts', () => {
  it('strips a null amount at the top level', () => {
    const result = sanitizeFacts({ facts: { calories: null, protein: 5 } })
    const facts = result['facts'] as Record<string, unknown>
    expect('calories' in facts).toBe(false)
    expect(facts['protein']).toBe(5)
  })

  it('preserves 0 (a zero number stays 0, not stripped)', () => {
    const result = sanitizeFacts({ facts: { calories: 0 } })
    const facts = result['facts'] as Record<string, unknown>
    expect(facts['calories']).toBe(0)
  })

  it('coerces a decimal string to a number at the top level', () => {
    const result = sanitizeFacts({ facts: { calories: '350.5' } })
    const facts = result['facts'] as Record<string, unknown>
    expect(facts['calories']).toBe(350.5)
    expect(typeof facts['calories']).toBe('number')
  })

  it('coerces a "0" string to the number 0 (not stripped)', () => {
    const result = sanitizeFacts({ facts: { calories: '0' } })
    const facts = result['facts'] as Record<string, unknown>
    expect(facts['calories']).toBe(0)
    expect(typeof facts['calories']).toBe('number')
  })

  it('coerces servingSize.amount from string to number; leaves unit string untouched', () => {
    const result = sanitizeFacts({
      facts: {
        servingSize: { amount: '100', unit: 'g' },
      },
    })
    const facts = result['facts'] as Record<string, unknown>
    const ss = facts['servingSize'] as Record<string, unknown>
    expect(ss['amount']).toBe(100)
    expect(typeof ss['amount']).toBe('number')
    expect(ss['unit']).toBe('g')
    expect(typeof ss['unit']).toBe('string')
  })

  it('coerces additional[].amount from string to number; leaves slug string untouched', () => {
    const result = sanitizeFacts({
      facts: {
        additional: [{ slug: 'vitamin-c', amount: '6' }],
      },
    })
    const facts = result['facts'] as Record<string, unknown>
    const additional = facts['additional'] as Array<Record<string, unknown>>
    expect(additional).toHaveLength(1)
    expect(additional[0]!['amount']).toBe(6)
    expect(typeof additional[0]!['amount']).toBe('number')
    expect(additional[0]!['slug']).toBe('vitamin-c')
    expect(typeof additional[0]!['slug']).toBe('string')
  })

  it('returns row unchanged when facts is null/undefined', () => {
    const row = { name: 'foo', facts: null }
    const result = sanitizeFacts(row as Record<string, unknown>)
    expect(result).toEqual(row)
  })

  it('handles a full mixed payload: strips nulls, coerces strings, preserves numbers and strings', () => {
    const result = sanitizeFacts({
      facts: {
        calories: '350',
        protein: 12,
        totalFat: null,
        servingSize: { amount: '100', unit: 'g', household: '1 cup' },
        additional: [
          { slug: 'vitamin-c', amount: '6' },
          { slug: 'iron', amount: 0 },
        ],
      },
    })
    const facts = result['facts'] as Record<string, unknown>
    expect(facts['calories']).toBe(350)
    expect(facts['protein']).toBe(12)
    expect('totalFat' in facts).toBe(false)
    const ss = facts['servingSize'] as Record<string, unknown>
    expect(ss['amount']).toBe(100)
    expect(ss['unit']).toBe('g')
    expect(ss['household']).toBe('1 cup')
    const additional = facts['additional'] as Array<Record<string, unknown>>
    expect(additional[0]!['amount']).toBe(6)
    expect(additional[0]!['slug']).toBe('vitamin-c')
    expect(additional[1]!['amount']).toBe(0)
    expect(additional[1]!['slug']).toBe('iron')
  })
})
