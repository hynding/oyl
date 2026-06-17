import { describe, expect, it } from 'vitest'
import { DayKey } from '../core/day-key.js'
import { relativeDayLabel, formatDayHeading, monthDayLabel, formatClockTime, spanLabel, dueInLabel } from './day.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

describe('relativeDayLabel', () => {
  it('today/yesterday/tomorrow else empty', () => {
    const today = DayKey.of('2026-06-10')
    expect(relativeDayLabel(today, today)).toBe('Today')
    expect(relativeDayLabel(today.addDays(-1), today)).toBe('Yesterday')
    expect(relativeDayLabel(today.addDays(1), today)).toBe('Tomorrow')
    expect(relativeDayLabel(today.addDays(-3), today)).toBe('')
  })
})

describe('formatDayHeading', () => {
  it('"Weekday, Mon D"', () => {
    const day = DayKey.of('2026-06-10')
    expect(formatDayHeading(day)).toBe(`${WEEKDAYS[day.weekday() - 1]}, Jun 10`)
  })
})

describe('monthDayLabel', () => {
  it('formats month and day, ignoring the year', () => {
    expect(monthDayLabel(DayKey.of('1990-06-20'))).toBe('Jun 20')
  })
})

describe('formatClockTime', () => {
  it('HH:MM-ish from a Date (locale-dependent → loose match)', () => {
    expect(formatClockTime(new Date('2026-06-10T08:05:00'))).toMatch(/\d{1,2}:\d{2}/)
  })
})

describe('spanLabel', () => {
  it('days under two weeks, weeks under ~two months, months beyond', () => {
    expect(spanLabel(1)).toBe('1 day')
    expect(spanLabel(13)).toBe('13 days')
    expect(spanLabel(14)).toBe('2 weeks')
    expect(spanLabel(59)).toBe('8 weeks')
    expect(spanLabel(60)).toBe('2 months')
  })
})

describe('dueInLabel', () => {
  const today = DayKey.of('2026-06-13')
  it('phrases near and far future days', () => {
    expect(dueInLabel(today, today)).toBe('today')
    expect(dueInLabel(today.addDays(1), today)).toBe('tomorrow')
    expect(dueInLabel(today.addDays(5), today)).toBe('in 5 days')
    expect(dueInLabel(today.addDays(21), today)).toBe('in 3 weeks')
    expect(dueInLabel(today.addDays(90), today)).toBe('in 3 months')
  })
  it('phrases past days', () => {
    expect(dueInLabel(today.addDays(-1), today)).toBe('yesterday')
    expect(dueInLabel(today.addDays(-5), today)).toBe('5 days ago')
  })
})
