import { describe, expect, it } from 'vitest'
import { DomainError } from './domain-error.js'
import { Entry, entryBaseJSON, parseEntryBase } from './entry.js'
import { Id } from './id.js'
import { MetricKey } from './metric-key.js'

class TestEntry extends Entry {
  private readonly values: ReadonlyMap<MetricKey, number>

  constructor(props: { id?: Id; occurredAt: Date; note?: string; values?: Record<string, number> }) {
    const { values = {}, ...base } = props
    super('test', base)
    this.values = new Map(Object.entries(values).map(([k, v]) => [MetricKey.of(k), v]))
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    return this.values
  }

  toJSON(): Record<string, unknown> {
    return entryBaseJSON(this)
  }
}

describe('Entry', () => {
  it('carries id, kind, occurredAt, optional note', () => {
    const at = new Date('2026-06-01T12:00:00Z')
    const e = new TestEntry({ occurredAt: at, note: 'hello' })
    expect(e.kind).toBe('test')
    expect(e.occurredAt.toISOString()).toBe(at.toISOString())
    expect(e.note).toBe('hello')
    expect(Id.of(e.id)).toBe(e.id)
  })

  it('defends occurredAt against external mutation', () => {
    const at = new Date('2026-06-01T12:00:00Z')
    const e = new TestEntry({ occurredAt: at })
    at.setUTCFullYear(1999)
    expect(e.occurredAt.getUTCFullYear()).toBe(2026)
    e.occurredAt.setUTCFullYear(1999)
    expect(e.occurredAt.getUTCFullYear()).toBe(2026)
  })

  it('subclasses report metrics', () => {
    const e = new TestEntry({ occurredAt: new Date(), values: { 'test.value': 7 } })
    expect(e.metrics().get(MetricKey.of('test.value'))).toBe(7)
  })

  it('entryBaseJSON emits the shared base fields', () => {
    const at = new Date('2026-06-01T12:00:00Z')
    const e = new TestEntry({ id: Id.of('00000000-0000-4000-8000-000000000100'), occurredAt: at, note: 'hi' })
    e.meta = { createdAt: at, updatedAt: at, revision: 1 }
    expect(entryBaseJSON(e)).toEqual({
      id: '00000000-0000-4000-8000-000000000100',
      kind: 'test',
      occurredAt: '2026-06-01T12:00:00.000Z',
      note: 'hi',
      meta: { createdAt: '2026-06-01T12:00:00.000Z', updatedAt: '2026-06-01T12:00:00.000Z', revision: 1 },
    })
  })

  it('parseEntryBase validates and splits base from rest', () => {
    const base = parseEntryBase(
      {
        id: '00000000-0000-4000-8000-000000000100',
        kind: 'test',
        occurredAt: '2026-06-01T12:00:00.000Z',
        note: 'hi',
        customField: 9,
      },
      'test',
    )
    expect(base.id).toBe('00000000-0000-4000-8000-000000000100')
    expect(base.occurredAt.toISOString()).toBe('2026-06-01T12:00:00.000Z')
    expect(base.note).toBe('hi')
    expect(base.meta).toBeUndefined()
    expect(base.rest).toEqual({ customField: 9 })
  })

  it('parseEntryBase revives meta when present', () => {
    const base = parseEntryBase(
      {
        id: '00000000-0000-4000-8000-000000000100',
        kind: 'test',
        occurredAt: '2026-06-01T12:00:00.000Z',
        meta: { createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z', revision: 3 },
      },
      'test',
    )
    expect(base.meta?.revision).toBe(3)
    expect(base.meta?.createdAt).toBeInstanceOf(Date)
  })

  it.each([
    null,
    42,
    { kind: 'other', id: '00000000-0000-4000-8000-000000000100', occurredAt: '2026-06-01T12:00:00.000Z' },
    { kind: 'test', id: 'nope', occurredAt: '2026-06-01T12:00:00.000Z' },
    { kind: 'test', id: '00000000-0000-4000-8000-000000000100', occurredAt: 'garbage' },
    { kind: 'test', id: '00000000-0000-4000-8000-000000000100' },
  ])('parseEntryBase rejects malformed shape %j with MALFORMED_JSON', (shape) => {
    let caught: unknown
    try {
      parseEntryBase(shape, 'test')
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })
})
