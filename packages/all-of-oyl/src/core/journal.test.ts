import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key.js'
import { DayRange } from './day-range.js'
import { Entry, entryBaseJSON } from './entry.js'
import { Id } from './id.js'
import { Journal } from './journal.js'
import { MetricKey } from './metric-key.js'
import { DomainError } from './domain-error.js'

class TestEntry extends Entry {
  private readonly values: ReadonlyMap<MetricKey, number>

  constructor(occurredAt: string, values: Record<string, number>, id?: Id) {
    super('test', { occurredAt: new Date(occurredAt), ...(id ? { id } : {}) })
    this.values = new Map(Object.entries(values).map(([k, v]) => [MetricKey.of(k), v]))
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    return this.values
  }

  toJSON(): Record<string, unknown> {
    return entryBaseJSON(this)
  }
}

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const range = (a: string, b: string) => DayRange.of(day(a), day(b))
const key = (s: string) => MetricKey.of(s)

describe('Journal', () => {
  it('requires a valid timezone', () => {
    let caught: unknown
    try {
      new Journal('Nowhere/Nope')
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_TIMEZONE')
  })

  it('buckets entries into days using its timezone', () => {
    const j = new Journal(NY)
    // 01:30Z on June 2 is the evening of June 1 in New York
    j.add(new TestEntry('2026-06-02T01:30:00Z', { 'nutrition.calories': 500 }))
    expect(j.entriesOn(day('2026-06-01'))).toHaveLength(1)
    expect(j.entriesOn(day('2026-06-02'))).toHaveLength(0)
  })

  it('strict adds: DUPLICATE_ID on re-add; idempotent removes', () => {
    const j = new Journal(NY)
    const id = Id.create()
    j.add(new TestEntry('2026-06-01T12:00:00Z', {}, id))
    let caught: unknown
    try {
      j.add(new TestEntry('2026-06-01T13:00:00Z', {}, id))
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('DUPLICATE_ID')
    j.remove(id)
    j.remove(id) // no-op, no throw
    expect(j.entriesOn(day('2026-06-01'))).toHaveLength(0)
  })

  it('entriesIn returns entries inside an inclusive range', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T12:00:00Z', {}))
    j.add(new TestEntry('2026-06-03T12:00:00Z', {}))
    j.add(new TestEntry('2026-06-05T12:00:00Z', {}))
    expect(j.entriesIn(range('2026-06-01', '2026-06-03'))).toHaveLength(2)
  })

  it('span covers first to last entry day; undefined when empty', () => {
    const j = new Journal(NY)
    expect(j.span()).toBeUndefined()
    j.add(new TestEntry('2026-06-03T12:00:00Z', {}))
    j.add(new TestEntry('2026-06-01T12:00:00Z', {}))
    expect(j.span()?.start.value).toBe('2026-06-01')
    expect(j.span()?.end.value).toBe('2026-06-03')
  })

  it('sum is flat; totalOf coalesces empty to 0', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T12:00:00Z', { 'nutrition.calories': 500 }))
    j.add(new TestEntry('2026-06-01T18:00:00Z', { 'nutrition.calories': 700 }))
    j.add(new TestEntry('2026-06-02T12:00:00Z', { 'nutrition.calories': 400 }))
    expect(j.totalOf(key('nutrition.calories'), range('2026-06-01', '2026-06-02'))).toBe(1600)
    expect(j.totalOf(key('nutrition.protein'), range('2026-06-01', '2026-06-02'))).toBe(0)
    expect(j.aggregate(key('nutrition.protein'), range('2026-06-01', '2026-06-02'), 'sum')).toBeUndefined()
  })

  it('avg is two-stage: within-day mean, then mean across days-with-data', () => {
    const j = new Journal(NY)
    // Day 1: two moods, 4 and 6 (day value 5). Day 2: one mood, 9. Day 3: nothing.
    j.add(new TestEntry('2026-06-01T09:00:00Z', { 'mood.score': 4 }))
    j.add(new TestEntry('2026-06-01T20:00:00Z', { 'mood.score': 6 }))
    j.add(new TestEntry('2026-06-02T12:00:00Z', { 'mood.score': 9 }))
    expect(j.aggregate(key('mood.score'), range('2026-06-01', '2026-06-03'), 'avg')).toBe(7) // (5+9)/2
  })

  it('last takes the most recent value; same-instant ties break by insertion order', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T08:00:00Z', { 'body.weight_kg': 80 }))
    j.add(new TestEntry('2026-06-02T08:00:00Z', { 'body.weight_kg': 79 }))
    expect(j.aggregate(key('body.weight_kg'), range('2026-06-01', '2026-06-02'), 'last')).toBe(79)

    const tied = new Journal(NY)
    tied.add(new TestEntry('2026-06-01T08:00:00Z', { 'body.weight_kg': 80 }))
    tied.add(new TestEntry('2026-06-01T08:00:00Z', { 'body.weight_kg': 81 }))
    expect(tied.aggregate(key('body.weight_kg'), range('2026-06-01', '2026-06-01'), 'last')).toBe(81)
  })

  it('last respects time order even when entries are added out of order', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T20:00:00Z', { 'body.weight_kg': 82 }))
    j.add(new TestEntry('2026-06-01T08:00:00Z', { 'body.weight_kg': 80 }))
    expect(j.aggregate(key('body.weight_kg'), range('2026-06-01', '2026-06-01'), 'last')).toBe(82)
  })

  it('totalsByPrefix enumerates sums under a prefix', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T12:00:00Z', { 'finance.spend.groceries': 42.1, 'finance.spend.dining': 18 }))
    j.add(new TestEntry('2026-06-02T12:00:00Z', { 'finance.spend.groceries': 10, 'finance.income.salary': 1000 }))
    const totals = j.totalsByPrefix('finance.spend', range('2026-06-01', '2026-06-02'))
    expect(totals.get(key('finance.spend.groceries'))).toBeCloseTo(52.1)
    expect(totals.get(key('finance.spend.dining'))).toBe(18)
    expect(totals.has(key('finance.income.salary'))).toBe(false)
  })
})
