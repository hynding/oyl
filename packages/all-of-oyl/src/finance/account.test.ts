import { describe, expect, it } from 'vitest'
import { Account } from './account'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

describe('Account', () => {
  it('constructs with name and ISO currency', () => {
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    expect(checking.name).toBe('Checking')
    expect(checking.currency).toBe('USD')
    expect(Id.of(checking.id)).toBe(checking.id)
  })

  it('rejects bad currencies and empty names', () => {
    for (const props of [
      { name: 'Checking', currency: 'dollars' },
      { name: 'Checking', currency: 'usd' },
      { name: '', currency: 'USD' },
    ]) {
      let caught: unknown
      try {
        new Account(props)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = { id: '00000000-0000-4000-8000-000000000032', name: 'Checking', currency: 'USD', futureField: [] }
    expect(Account.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'Checking' }, { id: 'nope', name: 'Checking', currency: 'USD' }]) {
      let caught: unknown
      try {
        Account.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
