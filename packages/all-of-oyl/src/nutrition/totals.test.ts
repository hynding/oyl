import { describe, expect, it } from 'vitest'
import { Consumption } from './consumption.js'
import { sumNutrients } from './totals.js'

const c = (nutrients: import('./nutrients.js').Nutrients, servings = 1) =>
  new Consumption({ occurredAt: new Date('2026-06-10T12:00:00Z'), nutrients, servings })

describe('sumNutrients', () => {
  it('sums nutrients × servings across consumptions', () => {
    const total = sumNutrients([c({ calories: 150, protein: 5 }, 2), c({ calories: 550, protein: 42, totalCarbohydrate: 45 })])
    expect(total).toEqual({ calories: 150 * 2 + 550, protein: 5 * 2 + 42, totalCarbohydrate: 45 })
  })
  it('omits fields no consumption carries and returns {} for empty', () => {
    expect(sumNutrients([])).toEqual({})
    expect(sumNutrients([c({ waterMl: 500 })])).toEqual({ waterMl: 500 })
  })
  it('merges additional entries by slug across consumptions, scaled by servings', () => {
    const a = c({ calories: 100, additional: [{ slug: 'vitamin-a', amount: 300 }] }, 2)
    const b = c({ additional: [{ slug: 'vitamin-a', amount: 100 }, { slug: 'vitamin-c', amount: 50 }] })
    const total = sumNutrients([a, b])
    expect(total.calories).toBe(200)
    expect(total.additional).toEqual(
      expect.arrayContaining([
        { slug: 'vitamin-a', amount: 700 }, // 300*2 + 100
        { slug: 'vitamin-c', amount: 50 },
      ]),
    )
  })
})
