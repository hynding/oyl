import { describe, expect, it } from 'vitest'
import { badgeStyles } from './sample-data.js'
import { OylGreetingDigest } from './oyl-greeting-digest.js'
import { OylStreakRing } from './oyl-streak-ring.js'
import { OylTodayPlan } from './oyl-today-plan.js'
import { OylTrendSparklines } from './oyl-trend-sparklines.js'
import { OylGoalRings } from './oyl-goal-rings.js'

/** @type {ReadonlyArray<readonly [string, { styles: CSSStyleSheet[] }]>} */
const WIDGET_CLASSES = [
  ['oyl-greeting-digest', OylGreetingDigest],
  ['oyl-streak-ring', OylStreakRing],
  ['oyl-today-plan', OylTodayPlan],
  ['oyl-trend-sparklines', OylTrendSparklines],
  ['oyl-goal-rings', OylGoalRings],
]

describe('badge convergence', () => {
  it('every widget adopts the shared badge stylesheet', () => {
    for (const [name, cls] of WIDGET_CLASSES) {
      expect(/** @type {CSSStyleSheet[]} */ (cls.styles).includes(badgeStyles), String(name)).toBe(true)
    }
  })

  it('no widget re-declares its own [data-sample-badge] rule', () => {
    for (const [name, cls] of WIDGET_CLASSES) {
      const own = /** @type {CSSStyleSheet[]} */ (cls.styles)
        .filter((s) => s !== badgeStyles)
        .flatMap((s) => [...s.cssRules].map((r) => r.cssText))
        .filter((t) => t.includes('[data-sample-badge]'))
      expect(own, String(name)).toEqual([])
    }
  })
})
