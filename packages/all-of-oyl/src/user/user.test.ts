import { describe, expect, it } from 'vitest'
import { User } from './user.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

describe('User', () => {
  it('constructs the profile shape', () => {
    const user = new User({
      displayName: 'Avery',
      timezone: 'America/New_York',
      defaultCurrency: 'USD',
      units: 'metric',
    })
    expect(user.displayName).toBe('Avery')
    expect(user.timezone).toBe('America/New_York')
    expect(user.defaultCurrency).toBe('USD')
    expect(user.units).toBe('metric')
    expect(Id.of(user.id)).toBe(user.id)
  })

  it('validates timezone and currency', () => {
    let caught1: unknown
    try {
      new User({ displayName: 'X', timezone: 'Bad/Zone', defaultCurrency: 'USD' })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_TIMEZONE')

    let caught2: unknown
    try {
      new User({ displayName: 'X', timezone: 'America/New_York', defaultCurrency: 'dollars' })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON and preserves unknown fields', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000001',
      displayName: 'Avery',
      timezone: 'America/New_York',
      defaultCurrency: 'USD',
      futureField: 42,
    }
    const user = User.fromJSON(shape)
    expect(user.units).toBeUndefined()
    const out = user.toJSON() as Record<string, unknown>
    expect(out['futureField']).toBe(42)
    expect(out['displayName']).toBe('Avery')
  })

  it('carries meta through JSON when present', () => {
    const user = new User({ displayName: 'Avery', timezone: 'America/New_York', defaultCurrency: 'USD' })
    user.meta = { createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), revision: 1 }
    const out = User.fromJSON(user.toJSON())
    expect(out.meta?.revision).toBe(1)
    expect(out.meta?.createdAt.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    let caught: unknown
    try {
      User.fromJSON({ id: '00000000-0000-4000-8000-000000000001', displayName: 'Avery' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })
})

describe('User optional profile fields', () => {
  it('round-trips birthday/weightKg/heightCm/gender/location', () => {
    const u = new User({
      displayName: 'Avery', timezone: 'America/New_York', defaultCurrency: 'USD', units: 'imperial',
      birthday: '1990-06-20', weightKg: 72.5, heightCm: 178, gender: 'non-binary', location: 'Austin, TX',
    })
    const back = User.fromJSON(JSON.parse(JSON.stringify(u.toJSON())))
    expect(back.birthday).toBe('1990-06-20')
    expect(back.weightKg).toBe(72.5)
    expect(back.heightCm).toBe(178)
    expect(back.gender).toBe('non-binary')
    expect(back.location).toBe('Austin, TX')
  })

  it('omits unset optional fields from JSON', () => {
    const u = new User({ displayName: 'A', timezone: 'UTC', defaultCurrency: 'USD' })
    expect('birthday' in u.toJSON()).toBe(false)
    expect('weightKg' in u.toJSON()).toBe(false)
  })

  it('rejects a malformed birthday and non-positive measurements', () => {
    const bad = (props: Record<string, unknown>) => {
      try { new User({ displayName: 'A', timezone: 'UTC', defaultCurrency: 'USD', ...props } as never); return null }
      catch (e) { return (e as DomainError).code }
    }
    expect(bad({ birthday: '06/20/1990' })).toBe('INVALID_QUANTITY')
    expect(bad({ weightKg: 0 })).toBe('INVALID_QUANTITY')
    expect(bad({ heightCm: -1 })).toBe('INVALID_QUANTITY')
  })
})
