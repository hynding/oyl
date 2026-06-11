import { describe, expect, it } from 'vitest'
import { Entry } from './entry'
import { Id } from './id'
import { MetricKey } from './metric-key'

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
})
