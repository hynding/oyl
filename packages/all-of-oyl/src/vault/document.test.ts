import { describe, expect, it } from 'vitest'
import { Document } from './document'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)

describe('Document', () => {
  it('constructs with name, kind, optional expiry', () => {
    const passport = new Document({ name: 'Passport', kind: 'passport', expiresOn: day('2026-09-01') })
    expect(passport.name).toBe('Passport')
    expect(passport.kind).toBe('passport')
    expect(Id.of(passport.id)).toBe(passport.id)
  })

  it('rejects empty name or kind', () => {
    for (const props of [
      { name: '', kind: 'passport' },
      { name: 'Passport', kind: '' },
    ]) {
      let caught: unknown
      try {
        new Document(props)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('a fixed due: nextDueOn returns the expiry regardless of asOf; undefined without one', () => {
    const passport = new Document({ name: 'Passport', kind: 'passport', expiresOn: day('2026-09-01') })
    expect(passport.nextDueOn(day('2026-06-01'))?.value).toBe('2026-09-01')
    expect(passport.nextDueOn(day('2030-01-01'))?.value).toBe('2026-09-01') // expired docs still report their expiry
    expect(new Document({ name: 'Will', kind: 'legal' }).nextDueOn(day('2026-06-01'))).toBeUndefined()
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = { id: '00000000-0000-4000-8000-000000002000', name: 'Passport', kind: 'passport', expiresOn: '2026-09-01', futureField: 14 }
    expect(Document.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'x', kind: 'y' }, { id: 'nope', name: 'x', kind: 'y' }, { id: '00000000-0000-4000-8000-000000002000', name: 'x', kind: 'y', expiresOn: 'garbage' }]) {
      let caught: unknown
      try {
        Document.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
