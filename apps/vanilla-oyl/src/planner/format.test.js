import { describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { overdueBadge } from './format.js'

describe('overdueBadge', () => {
  it('"Due Mon D · Nd ago"', () => {
    expect(overdueBadge(DayKey.of('2026-06-13'), DayKey.of('2026-06-16'))).toBe('Due Jun 13 · 3d ago')
    expect(overdueBadge(DayKey.of('2026-06-15'), DayKey.of('2026-06-16'))).toBe('Due Jun 15 · 1d ago')
  })
})
