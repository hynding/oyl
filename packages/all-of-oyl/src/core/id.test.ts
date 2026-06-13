import { describe, expect, it } from 'vitest'
import { Id } from './id.js'
import { DomainError } from './domain-error.js'

describe('Id', () => {
  it('creates valid, unique ids', () => {
    const a = Id.create()
    const b = Id.create()
    expect(a).not.toBe(b)
    expect(Id.of(a)).toBe(a)
  })

  it('validates existing id strings', () => {
    const fixture = '00000000-0000-4000-8000-000000000001'
    expect(Id.of(fixture)).toBe(fixture)
  })

  it('rejects non-UUID strings with INVALID_ID', () => {
    for (const bad of ['', 'abc', '00000000-0000-4000-8000-00000000000']) {
      let caught: unknown
      try {
        Id.of(bad)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_ID')
    }
  })

  it('compares with === (branded string)', () => {
    const a = Id.of('00000000-0000-4000-8000-000000000001')
    const b = Id.of('00000000-0000-4000-8000-000000000001')
    expect(a === b).toBe(true)
  })
})
