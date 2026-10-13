import { describe, expect, it } from 'vitest'
import { badgeStyles, SAMPLE, withSample } from './sample-data.js'

describe('sample data', () => {
  it('fixtures are frozen plain values with the pinned shapes', () => {
    expect(Object.isFrozen(SAMPLE)).toBe(true)
    expect(SAMPLE.streak).toBe(12)
    expect(SAMPLE.todayPlan).toEqual({ done: 3, total: 5, next: 'Run 5k' })
    for (const key of /** @type {const} */ (['spending', 'calories', 'activeMinutes'])) {
      expect(SAMPLE.series[key]).toHaveLength(14)
    }
    expect(SAMPLE.goals).toHaveLength(3)
    expect(SAMPLE.digest).toEqual({ plansDone: 3, plansTotal: 5, goalsMet: 1, goalsTotal: 3, streak: 12 })
  })

  it('withSample picks fixture only when empty and reports sample-ness', () => {
    expect(withSample(false, 7, 12)).toEqual({ value: 7, sample: false })
    expect(withSample(true, 0, 12)).toEqual({ value: 12, sample: true })
  })

  it('exports the one shared badge stylesheet', () => {
    expect(badgeStyles).toBeInstanceOf(CSSStyleSheet)
    const text = [...badgeStyles.cssRules].map((r) => r.cssText).join('\n')
    expect(text).toContain('[data-sample-badge]')
    expect(text).toContain('position: absolute')
    // No media queries and no layout-attribute rules — keeps the structural
    // media-scoping tests' world simple.
    expect([...badgeStyles.cssRules].some((r) => 'conditionText' in r)).toBe(false)
  })
})
