import { describe, expect, it } from 'vitest'
import { periodWindowOf } from './period'
import { DayKey } from '../core/day-key'

const day = (s: string) => DayKey.of(s)
const window = (period: 'day' | 'week' | 'month', s: string) => {
  const w = periodWindowOf(period, day(s))
  return [w.start.value, w.end.value]
}

describe('periodWindowOf', () => {
  it('day window is the day itself', () => {
    expect(window('day', '2026-06-03')).toEqual(['2026-06-03', '2026-06-03'])
  })

  it('week window is the ISO Monday–Sunday week containing the day', () => {
    expect(window('week', '2026-06-03')).toEqual(['2026-06-01', '2026-06-07']) // Wednesday
    expect(window('week', '2026-06-01')).toEqual(['2026-06-01', '2026-06-07']) // Monday boundary
    expect(window('week', '2026-06-07')).toEqual(['2026-06-01', '2026-06-07']) // Sunday boundary
  })

  it('week windows span year boundaries (ISO week 53)', () => {
    // 2026-01-01 is a Thursday; its ISO week starts Monday 2025-12-29
    expect(window('week', '2026-01-01')).toEqual(['2025-12-29', '2026-01-04'])
    expect(window('week', '2025-12-29')).toEqual(['2025-12-29', '2026-01-04'])
  })

  it('month window is the calendar month, leap-aware', () => {
    expect(window('month', '2026-06-15')).toEqual(['2026-06-01', '2026-06-30'])
    expect(window('month', '2026-02-10')).toEqual(['2026-02-01', '2026-02-28'])
    expect(window('month', '2024-02-10')).toEqual(['2024-02-01', '2024-02-29']) // leap
    expect(window('month', '2026-12-31')).toEqual(['2026-12-01', '2026-12-31'])
  })
})
