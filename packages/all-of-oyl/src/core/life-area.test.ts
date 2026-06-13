import { describe, expect, it } from 'vitest'
import { Id } from './id.js'
import { LifeArea } from './life-area.js'
import { DomainError } from './domain-error.js'

describe('LifeArea', () => {
  it('constructs with generated id and validated slug', () => {
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    expect(area.name).toBe('Health')
    expect(area.slug).toBe('health')
    expect(Id.of(area.id)).toBe(area.id)
    expect(area.meta).toBeUndefined()
  })

  it('rejects invalid slugs', () => {
    let caught: unknown
    try {
      new LifeArea({ name: 'Health', slug: 'Heal th' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_SLUG')
  })

  it('round-trips JSON exactly', () => {
    const area = new LifeArea({ id: Id.of('00000000-0000-4000-8000-000000000010'), name: 'Health', slug: 'health' })
    const revived = LifeArea.fromJSON(area.toJSON())
    expect(revived.id).toBe(area.id)
    expect(revived.name).toBe('Health')
    expect(revived.slug).toBe('health')
  })

  it('tolerant reader: preserves unknown fields through a round-trip', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000010',
      name: 'Health',
      slug: 'health',
      futureField: { nested: true },
    }
    const out = LifeArea.fromJSON(shape).toJSON() as Record<string, unknown>
    expect(out['futureField']).toEqual({ nested: true })
    expect(out['name']).toBe('Health')
  })

  it('throws MALFORMED_JSON on bad known fields', () => {
    let caught: unknown
    try {
      LifeArea.fromJSON({ id: 'nope', name: 'Health', slug: 'health' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })

  it('carries meta through JSON when present', () => {
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    area.meta = { createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), revision: 1 }
    const out = LifeArea.fromJSON(area.toJSON())
    expect(out.meta?.revision).toBe(1)
    expect(out.meta?.createdAt.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })
})
