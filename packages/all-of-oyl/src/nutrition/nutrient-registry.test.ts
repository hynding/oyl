import { describe, expect, it } from 'vitest'
import { NUTRIENTS, nutrientDef, mandatoryNutrients } from './nutrient-registry.js'

describe('nutrient registry', () => {
  it('has unique slugs and valid units', () => {
    const slugs = NUTRIENTS.map((n) => n.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const n of NUTRIENTS) expect(['kcal', 'g', 'mg', 'mcg', 'ml']).toContain(n.canonicalUnit)
  })

  it('exposes the FDA mandatory set incl. calories/macros/key micros', () => {
    const m = mandatoryNutrients().map((n) => n.slug)
    for (const s of [
      'calories',
      'total-fat',
      'saturated-fat',
      'trans-fat',
      'cholesterol',
      'sodium',
      'total-carbohydrate',
      'dietary-fiber',
      'total-sugars',
      'added-sugars',
      'protein',
      'vitamin-d',
      'calcium',
      'iron',
      'potassium',
    ])
      expect(m).toContain(s)
  })

  it('returns the mandatory set in FDA label-panel order (not alphabetical)', () => {
    const m = mandatoryNutrients().map((n) => n.slug)
    expect(m[0]).toBe('calories')
    expect(m[1]).toBe('total-fat')
    expect(m[m.length - 1]).toBe('potassium')
  })

  it('looks up by slug and carries daily values for %DV nutrients', () => {
    expect(nutrientDef('zzz-unknown')).toBeUndefined()
    expect(nutrientDef('sodium')?.dailyValue).toBe(2300) // mg
  })
})
