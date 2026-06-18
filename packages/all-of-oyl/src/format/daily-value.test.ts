import { describe, expect, it } from 'vitest'
import { percentDailyValue } from './daily-value.js'

describe('percentDailyValue', () => {
  it('returns rounded integer percent for nutrients with dailyValue', () => {
    expect(percentDailyValue('sodium', 1150)).toBe(50)
  })
  it('returns undefined for nutrients without dailyValue', () => {
    expect(percentDailyValue('calories', 200)).toBeUndefined()
  })
  it('returns undefined for unknown nutrients', () => {
    expect(percentDailyValue('zzz', 1)).toBeUndefined()
  })
  it('rounds non-integer percentages correctly', () => {
    expect(percentDailyValue('total-fat', 10)).toBe(13)
  })
})
