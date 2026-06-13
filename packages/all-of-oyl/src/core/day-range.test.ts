import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key.js'
import { DayRange } from './day-range.js'
import { DomainError } from './domain-error.js'

describe('DayRange', () => {
  it('is inclusive on both ends and iterable', () => {
    const range = DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-03'))
    expect([...range].map((d) => d.value)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('contains its boundary days', () => {
    const range = DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-03'))
    expect(range.contains(DayKey.of('2026-06-01'))).toBe(true)
    expect(range.contains(DayKey.of('2026-06-03'))).toBe(true)
    expect(range.contains(DayKey.of('2026-05-31'))).toBe(false)
    expect(range.contains(DayKey.of('2026-06-04'))).toBe(false)
  })

  it('allows a single-day range', () => {
    const day = DayKey.of('2026-06-01')
    expect([...DayRange.of(day, day)].map((d) => d.value)).toEqual(['2026-06-01'])
  })

  it('rejects end < start with INVALID_RANGE', () => {
    let caught: unknown
    try {
      DayRange.of(DayKey.of('2026-06-02'), DayKey.of('2026-06-01'))
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_RANGE')
  })

  it('equals by value', () => {
    const a = DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-03'))
    const b = DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-03'))
    expect(a.equals(b)).toBe(true)
  })
})

describe('DayRange.lengthInDays', () => {
  it('counts inclusive days, across month boundaries', () => {
    expect(DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-01')).lengthInDays()).toBe(1)
    expect(DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-07')).lengthInDays()).toBe(7)
    expect(DayRange.of(DayKey.of('2026-05-25'), DayKey.of('2026-06-03')).lengthInDays()).toBe(10)
  })
})
