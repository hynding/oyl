import { describe, expect, it } from 'vitest'
import { assertSlug, isSlug } from './slug.js'
import { DomainError } from './domain-error.js'

describe('slug', () => {
  it.each(['run', 'guitar_practice', 'a1', '_x'])('accepts %s', (s) => {
    expect(isSlug(s)).toBe(true)
    expect(assertSlug(s)).toBe(s)
  })

  it.each(['', 'Run', 'two words', 'has-dash', 'dot.ted', 'émoji'])('rejects %s', (s) => {
    expect(isSlug(s)).toBe(false)
    expect(() => assertSlug(s)).toThrowError(DomainError)
    try {
      assertSlug(s)
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_SLUG')
    }
  })
})
