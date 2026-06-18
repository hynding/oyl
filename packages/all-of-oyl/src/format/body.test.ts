import { describe, expect, it } from 'vitest'
import { formatWeight, formatHeight, age } from './body.js'

describe('formatWeight', () => {
  it('metric shows kilograms to one decimal', () => {
    expect(formatWeight(72.5, 'metric')).toBe('72.5 kg')
    expect(formatWeight(70, 'metric')).toBe('70 kg')
  })
  it('imperial shows whole pounds', () => {
    expect(formatWeight(72.5, 'imperial')).toBe('160 lb')
  })
})

describe('formatHeight', () => {
  it('metric shows whole centimetres', () => {
    expect(formatHeight(178, 'metric')).toBe('178 cm')
  })
  it('imperial shows feet and inches, carrying 12in up', () => {
    expect(formatHeight(178, 'imperial')).toBe('5 ft 10 in')
    expect(formatHeight(183, 'imperial')).toBe('6 ft 0 in')
  })
})

describe('age', () => {
  it('counts whole years, not yet reached this year', () => {
    expect(age('1990-06-20', '2026-06-17')).toBe(35)
  })
  it('counts the birthday itself', () => {
    expect(age('1990-06-17', '2026-06-17')).toBe(36)
  })
})
