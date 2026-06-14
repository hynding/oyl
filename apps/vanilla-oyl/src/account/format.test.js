import { describe, expect, it } from 'vitest'
import { Money } from '@oyl/all-of-oyl'
import { accountSpendLabel } from './format.js'

describe('accountSpendLabel', () => {
  it('formats the money with a "this month" suffix', () => {
    expect(accountSpendLabel(Money.of(6500, 'USD', 2))).toBe('$65.00 this month')
  })
  it('handles zero', () => {
    expect(accountSpendLabel(Money.of(0, 'USD', 2))).toBe('$0.00 this month')
  })
})
