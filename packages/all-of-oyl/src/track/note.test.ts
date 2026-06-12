import { describe, expect, it } from 'vitest'
import { Note } from './note'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { DomainError } from '../core/domain-error'

const when = new Date('2026-06-01T21:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('Note', () => {
  it('emits note.count plus a count per tag', () => {
    const entry = new Note({ occurredAt: when, text: 'Grateful for the rain.', tags: ['gratitude', 'weather'] })
    expect(entry.kind).toBe('note')
    expect(entry.metrics().get(key('note.count'))).toBe(1)
    expect(entry.metrics().get(key('note.gratitude.count'))).toBe(1)
    expect(entry.metrics().get(key('note.weather.count'))).toBe(1)
  })

  it('dedupes tags and works without them', () => {
    const entry = new Note({ occurredAt: when, text: 'x', tags: ['gratitude', 'gratitude'] })
    expect(entry.tags).toEqual(['gratitude'])
    const plain = new Note({ occurredAt: when, text: 'just journaling' })
    expect(plain.metrics().size).toBe(1)
  })

  it('rejects empty text and invalid tags', () => {
    let caught1: unknown
    try {
      new Note({ occurredAt: when, text: '' })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_QUANTITY')

    let caught2: unknown
    try {
      new Note({ occurredAt: when, text: 'x', tags: ['Bad Tag'] })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_SLUG')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const entry = new Note({ id: Id.of('00000000-0000-4000-8000-000000000104'), occurredAt: when, text: 'Grateful.', tags: ['gratitude'] })
    const revived = Note.fromJSON({ ...entry.toJSON(), futureField: 5 })
    expect(revived.text).toBe('Grateful.')
    expect(revived.tags).toEqual(['gratitude'])
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(5)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    let caught: unknown
    try {
      Note.fromJSON({ kind: 'note', id: '00000000-0000-4000-8000-000000000104', occurredAt: when.toISOString(), tags: ['x'] }) // no text
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })
})
