// packages/all-of-oyl/src/insights/correlate.test.ts
import { describe, expect, it } from 'vitest'
import { correlate } from './correlate'
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import { Journal } from '../core/journal'
import { MetricKey } from '../core/metric-key'
import { Measurement } from '../track/measurement'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const range = (a: string, b: string) => DayRange.of(day(a), day(b))
const A = MetricKey.of('custom.a')
const B = MetricKey.of('custom.b')

function journalWith(entries: [string, string, number][]): Journal {
  const j = new Journal(NY)
  let minute = 0
  for (const [dayValue, metric, value] of entries) {
    j.add(new Measurement({ occurredAt: new Date(`${dayValue}T12:${String(minute++).padStart(2, '0')}:00Z`), metric, value }))
  }
  return j
}

describe('correlate', () => {
  it('finds perfect positive correlation', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 1], ['2026-06-01', 'custom.b', 2],
      ['2026-06-02', 'custom.a', 2], ['2026-06-02', 'custom.b', 4],
      ['2026-06-03', 'custom.a', 3], ['2026-06-03', 'custom.b', 6],
      ['2026-06-04', 'custom.a', 4], ['2026-06-04', 'custom.b', 8],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-04'))).toBeCloseTo(1)
  })

  it('finds perfect negative correlation', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 1], ['2026-06-01', 'custom.b', 9],
      ['2026-06-02', 'custom.a', 2], ['2026-06-02', 'custom.b', 8],
      ['2026-06-03', 'custom.a', 3], ['2026-06-03', 'custom.b', 7],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-03'))).toBeCloseTo(-1)
  })

  it('only days where BOTH metrics have data count as overlap', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 1], ['2026-06-01', 'custom.b', 2],
      ['2026-06-02', 'custom.a', 2], // no b
      ['2026-06-03', 'custom.a', 3], ['2026-06-03', 'custom.b', 6],
      ['2026-06-04', 'custom.b', 99], // no a
      ['2026-06-05', 'custom.a', 5], ['2026-06-05', 'custom.b', 10],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-05'))).toBeCloseTo(1)
  })

  it('returns undefined below 3 overlapping days', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 1], ['2026-06-01', 'custom.b', 2],
      ['2026-06-02', 'custom.a', 2], ['2026-06-02', 'custom.b', 4],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-02'))).toBeUndefined()
    expect(correlate(new Journal(NY), A, B, range('2026-06-01', '2026-06-05'))).toBeUndefined()
  })

  it('returns undefined for zero variance — a constant correlates with nothing', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 7], ['2026-06-01', 'custom.b', 2],
      ['2026-06-02', 'custom.a', 7], ['2026-06-02', 'custom.b', 4],
      ['2026-06-03', 'custom.a', 7], ['2026-06-03', 'custom.b', 6],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-03'))).toBeUndefined()
  })

  it('per-metric aggregation kinds: mood-vs-sleep style avg/avg', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 4], ['2026-06-01', 'custom.a', 6], // avg 5
      ['2026-06-01', 'custom.b', 5],
      ['2026-06-02', 'custom.a', 7], ['2026-06-02', 'custom.b', 7],
      ['2026-06-03', 'custom.a', 9], ['2026-06-03', 'custom.b', 9],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-03'), { a: 'avg', b: 'avg' })).toBeCloseTo(1)
    // under the default 'sum', day 1's a would be 10, not 5 — and the correlation degrades
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-03'))).not.toBeCloseTo(1)
  })
})
