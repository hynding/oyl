import { describe, expect, it } from 'vitest'
import { parseHash } from './route.js'

describe('route parsing', () => {
  it('defaults empty/“#” to status', () => {
    expect(parseHash('')).toBe('status')
    expect(parseHash('#')).toBe('status')
    expect(parseHash('#/')).toBe('status')
  })

  it('extracts the first path segment', () => {
    expect(parseHash('#/status')).toBe('status')
    expect(parseHash('#/journal')).toBe('journal')
    expect(parseHash('#/journal/today')).toBe('journal')
  })
})
