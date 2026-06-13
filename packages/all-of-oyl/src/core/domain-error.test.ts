import { describe, expect, it } from 'vitest'
import { DomainError } from './domain-error.js'

describe('DomainError', () => {
  it('carries a code and message and is an Error', () => {
    const err = new DomainError('CURRENCY_MISMATCH', 'cannot add USD to EUR')
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('CURRENCY_MISMATCH')
    expect(err.message).toBe('cannot add USD to EUR')
    expect(err.name).toBe('DomainError')
  })
})
