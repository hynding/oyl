import { describe, expect, it } from 'vitest'
import { measurementUnit } from './format.js'

describe('measurementUnit', () => {
  it('known keys map to a unit, unknown to empty', () => {
    expect(measurementUnit('body.weight_kg')).toBe('kg')
    expect(measurementUnit('sleep.hours')).toBe('h')
    expect(measurementUnit('screen.minutes')).toBe('min')
    expect(measurementUnit('mood.score')).toBe('')
    expect(measurementUnit('custom.whatever')).toBe('')
  })
})
