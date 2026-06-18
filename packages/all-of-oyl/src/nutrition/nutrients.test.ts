import { describe, expect, it } from 'vitest'
import { assertNutritionFacts, nutritionFactsToJSON, nutritionFactsFromJSON, NUTRIENT_METRICS } from './nutrients.js'
import { DomainError } from '../core/domain-error.js'

describe('NutritionFacts helpers', () => {
  it('round-trips present fields (legacy small set)', () => {
    const n = { calories: 200, protein: 10 }
    expect(nutritionFactsFromJSON(nutritionFactsToJSON(n))).toEqual(n)
  })

  it('rejects a negative nutrient', () => {
    let code: unknown
    try { assertNutritionFacts({ calories: -1 }) } catch (e) { code = (e as DomainError).code }
    expect(code).toBe('INVALID_QUANTITY')
  })

  it('round-trips a full NutritionFacts (servingSize + mandatory fields + additional)', () => {
    const facts = {
      servingSize: { amount: 28, unit: 'g', household: '1 cup' },
      calories: 110,
      totalFat: 3.5,
      saturatedFat: 0.5,
      transFat: 0,
      cholesterol: 0,
      sodium: 160,
      totalCarbohydrate: 20,
      dietaryFiber: 2,
      totalSugars: 5,
      addedSugars: 3,
      protein: 3,
      vitaminD: 2,
      calcium: 130,
      iron: 8,
      potassium: 235,
      waterMl: 15,
      additional: [{ slug: 'vitamin-a', amount: 300 }],
    }
    const revived = nutritionFactsFromJSON(nutritionFactsToJSON(facts))
    expect(revived).toEqual(facts)
  })

  it('rejects a negative mandatory amount', () => {
    let code: unknown
    try { assertNutritionFacts({ sodium: -10 }) } catch (e) { code = (e as DomainError).code }
    expect(code).toBe('INVALID_QUANTITY')
  })

  it('rejects servingSize.amount <= 0', () => {
    let code: unknown
    try { assertNutritionFacts({ servingSize: { amount: 0, unit: 'g' } }) } catch (e) { code = (e as DomainError).code }
    expect(code).toBe('INVALID_QUANTITY')

    let code2: unknown
    try { assertNutritionFacts({ servingSize: { amount: -5, unit: 'g' } }) } catch (e) { code2 = (e as DomainError).code }
    expect(code2).toBe('INVALID_QUANTITY')
  })

  it('rejects additional entry with unknown slug', () => {
    let code: unknown
    try { assertNutritionFacts({ additional: [{ slug: 'not-a-real-nutrient', amount: 1 }] }) } catch (e) { code = (e as DomainError).code }
    expect(code).toBe('INVALID_QUANTITY')
  })

  it('rejects additional entry with negative amount', () => {
    let code: unknown
    try { assertNutritionFacts({ additional: [{ slug: 'vitamin-a', amount: -1 }] }) } catch (e) { code = (e as DomainError).code }
    expect(code).toBe('INVALID_QUANTITY')
  })

  it('NUTRIENT_METRICS includes protein and sodium with underscore metric keys', () => {
    const keys = NUTRIENT_METRICS.map(([field]) => field)
    const metricKeys = NUTRIENT_METRICS.map(([, m]) => m)
    expect(keys).toContain('protein')
    expect(keys).toContain('sodium')
    expect(metricKeys).toContain('nutrition.protein')
    expect(metricKeys).toContain('nutrition.sodium')
    // MetricKey constraint: no hyphens allowed — total-fat slug → nutrition.total_fat
    expect(metricKeys).toContain('nutrition.total_fat')
    expect(metricKeys).toContain('nutrition.total_carbohydrate')
  })
})
