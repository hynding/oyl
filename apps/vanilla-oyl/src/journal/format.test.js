import { describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { relativeDayLabel, formatDayHeading, formatClockTime, measurementUnit } from './format.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

describe('journal format helpers', () => {
  it('relativeDayLabel: today/yesterday/tomorrow else empty', () => {
    const today = DayKey.of('2026-06-10')
    expect(relativeDayLabel(today, today)).toBe('Today')
    expect(relativeDayLabel(today.addDays(-1), today)).toBe('Yesterday')
    expect(relativeDayLabel(today.addDays(1), today)).toBe('Tomorrow')
    expect(relativeDayLabel(today.addDays(-3), today)).toBe('')
  })

  it('formatDayHeading: "Weekday, Mon D"', () => {
    const day = DayKey.of('2026-06-10')
    expect(formatDayHeading(day)).toBe(`${WEEKDAYS[day.weekday() - 1]}, Jun 10`)
  })

  it('formatClockTime: HH:MM-ish from a Date', () => {
    expect(formatClockTime(new Date('2026-06-10T08:05:00'))).toMatch(/\d{1,2}:\d{2}/)
  })

  it('measurementUnit: known keys map to a unit, unknown to empty', () => {
    expect(measurementUnit('body.weight_kg')).toBe('kg')
    expect(measurementUnit('sleep.hours')).toBe('h')
    expect(measurementUnit('screen.minutes')).toBe('min')
    expect(measurementUnit('mood.score')).toBe('')
    expect(measurementUnit('custom.whatever')).toBe('')
  })
})
