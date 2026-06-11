import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key'
import { DomainError } from './domain-error'

describe('DayKey', () => {
  it('buckets an instant into a day per explicit timezone', () => {
    // 2026-06-02T01:30Z is the evening of June 1 in New York, morning of June 2 in Tokyo
    const instant = new Date('2026-06-02T01:30:00Z')
    expect(DayKey.from(instant, 'America/New_York').value).toBe('2026-06-01')
    expect(DayKey.from(instant, 'Asia/Tokyo').value).toBe('2026-06-02')
  })

  it('handles DST transition days (spring forward in New York, 2026-03-08)', () => {
    // 06:59Z is 01:59 EST (still Mar 8); 23:59Z on Mar 8 is 19:59 EDT (still Mar 8)
    expect(DayKey.from(new Date('2026-03-08T06:59:00Z'), 'America/New_York').value).toBe('2026-03-08')
    expect(DayKey.from(new Date('2026-03-08T23:59:00Z'), 'America/New_York').value).toBe('2026-03-08')
  })

  it('parses and validates day strings', () => {
    expect(DayKey.of('2026-06-01').value).toBe('2026-06-01')
    for (const bad of ['2026-6-1', '2026-13-01', '2026-02-30', 'garbage', '']) {
      let caught: unknown
      try {
        DayKey.of(bad)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_DAY')
    }
  })

  it('rejects unknown timezones with INVALID_TIMEZONE', () => {
    let caught: unknown
    try {
      DayKey.from(new Date(), 'Mars/Olympus_Mons')
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_TIMEZONE')
  })

  it('adds days across month and year boundaries', () => {
    expect(DayKey.of('2026-01-31').addDays(1).value).toBe('2026-02-01')
    expect(DayKey.of('2026-12-31').addDays(1).value).toBe('2027-01-01')
    expect(DayKey.of('2026-03-01').addDays(-1).value).toBe('2026-02-28')
    expect(DayKey.of('2024-03-01').addDays(-1).value).toBe('2024-02-29') // leap year
  })

  it('compares and equals', () => {
    const a = DayKey.of('2026-06-01')
    const b = DayKey.of('2026-06-02')
    expect(a.compare(b)).toBeLessThan(0)
    expect(b.compare(a)).toBeGreaterThan(0)
    expect(a.equals(DayKey.of('2026-06-01'))).toBe(true)
    expect(a.equals(b)).toBe(false)
  })

  it('reports ISO weekday (Mon=1 … Sun=7)', () => {
    expect(DayKey.of('2026-06-01').weekday()).toBe(1) // Monday
    expect(DayKey.of('2026-06-07').weekday()).toBe(7) // Sunday
  })

  it('serializes as its string', () => {
    expect(DayKey.of('2026-06-01').toJSON()).toBe('2026-06-01')
    expect(DayKey.fromJSON('2026-06-01').equals(DayKey.of('2026-06-01'))).toBe(true)
  })
})
