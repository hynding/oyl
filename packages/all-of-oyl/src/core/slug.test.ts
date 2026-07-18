import { describe, expect, it } from 'vitest'
import { assertSlug, isSlug, toSlug } from './slug.js'
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

  describe('toSlug', () => {
    it.each([
      ['Rolled Oats', 'rolled_oats'],
      ['  Two   Words  ', 'two_words'],
      ['has-dash.and.dots', 'has_dash_and_dots'],
      ['Émoji café', 'moji_caf'],
      ['already_ok', 'already_ok'],
      ['A1 B2', 'a1_b2'],
    ])('derives a valid slug from %j', (input, expected) => {
      const s = toSlug(input)
      expect(s).toBe(expected)
      expect(isSlug(s)).toBe(true)
    })

    it('falls back to "item" when nothing slug-able remains', () => {
      expect(toSlug('———')).toBe('item')
      expect(toSlug('')).toBe('item')
      expect(isSlug(toSlug('———'))).toBe(true)
    })
  })
})
