import { describe, expect, it } from 'vitest'
import { measurementUnit, parseTags, TAG_RE } from './format.js'

describe('measurementUnit', () => {
  it('maps known keys and falls back to empty', () => {
    expect(measurementUnit('body.weight_kg')).toBe('kg')
    expect(measurementUnit('sleep.hours')).toBe('h')
    expect(measurementUnit('screen.minutes')).toBe('min')
    expect(measurementUnit('mood.score')).toBe('')
    expect(measurementUnit('custom.pushups')).toBe('')
  })
})

describe('tags', () => {
  it('splits on whitespace and commas', () => {
    expect(parseTags('walking, evening  calm')).toEqual(['walking', 'evening', 'calm'])
    expect(parseTags('')).toEqual([])
  })
  it('validates slugs', () => {
    expect(TAG_RE.test('long-way')).toBe(true)
    expect(TAG_RE.test('Bad')).toBe(false)
    expect(TAG_RE.test('a--b')).toBe(false)
  })
})
