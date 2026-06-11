import { describe, expect, it } from 'vitest'
import { Cadence } from './cadence'
import { DayKey } from './day-key'
import { DomainError } from './domain-error'

const day = (s: string) => DayKey.of(s)

describe('Cadence', () => {
  it('steps days and weeks from the anchor', () => {
    expect(Cadence.of(10, 'days').nextOnOrAfter(day('2026-06-01'), day('2026-06-02')).value).toBe('2026-06-11')
    expect(Cadence.of(2, 'weeks').nextOnOrAfter(day('2026-06-01'), day('2026-06-16')).value).toBe('2026-06-29')
  })

  it('returns the anchor itself when asOf is on or before it', () => {
    expect(Cadence.of(1, 'months').nextOnOrAfter(day('2026-06-15'), day('2026-06-01')).value).toBe('2026-06-15')
    expect(Cadence.of(1, 'months').nextOnOrAfter(day('2026-06-15'), day('2026-06-15')).value).toBe('2026-06-15')
  })

  it('clamps month-end per occurrence without drifting', () => {
    const monthly = Cadence.of(1, 'months')
    const anchor = day('2026-01-31')
    expect(monthly.nextOnOrAfter(anchor, day('2026-02-01')).value).toBe('2026-02-28')
    // the anchor is preserved: March returns to the 31st, not the 28th
    expect(monthly.nextOnOrAfter(anchor, day('2026-03-01')).value).toBe('2026-03-31')
  })

  it('handles Feb 29 anchors yearly', () => {
    const yearly = Cadence.of(1, 'years')
    const anchor = day('2024-02-29')
    expect(yearly.nextOnOrAfter(anchor, day('2025-01-01')).value).toBe('2025-02-28')
    expect(yearly.nextOnOrAfter(anchor, day('2028-01-01')).value).toBe('2028-02-29')
  })

  it('nextAfter re-anchors from the given day', () => {
    expect(Cadence.of(7, 'days').nextAfter(day('2026-06-03')).value).toBe('2026-06-10')
  })

  it('rejects n < 1 with INVALID_QUANTITY', () => {
    for (const n of [0, -1, 1.5]) {
      let caught: unknown
      try {
        Cadence.of(n, 'days')
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('equals by value and serializes', () => {
    expect(Cadence.of(2, 'weeks').equals(Cadence.of(2, 'weeks'))).toBe(true)
    expect(Cadence.of(2, 'weeks').toJSON()).toEqual({ n: 2, unit: 'weeks' })
    expect(Cadence.fromJSON({ n: 2, unit: 'weeks' }).equals(Cadence.of(2, 'weeks'))).toBe(true)
  })
})
