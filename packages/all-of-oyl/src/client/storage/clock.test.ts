import { describe, expect, it } from 'vitest'
import { now, defaultTimezone } from './clock.js'

describe('clock', () => {
  it('now() returns a Date', () => {
    expect(now()).toBeInstanceOf(Date)
  })

  it('defaultTimezone() returns a non-empty IANA string', () => {
    const tz = defaultTimezone()
    expect(typeof tz).toBe('string')
    expect(tz.length).toBeGreaterThan(0)
  })
})
