import { describe, expect, it } from 'vitest'
import { Consumption } from '@oyl/all-of-oyl'
import { formatClockTime } from '@oyl/all-of-oyl/format'
import { consumptionMeta, mealLabel, tileValue, TILES, NUTRIENT_FIELDS } from './format.js'

const at = new Date('2026-10-08T08:10:00')

describe('consumptionMeta', () => {
  it('per-serving nutrients, then the time', () => {
    const c = new Consumption({ occurredAt: at, nutrients: { calories: 150, protein: 5 } })
    expect(consumptionMeta(c)).toBe(`150 kcal · 5g P · ${formatClockTime(at)}`)
  })
  it('adds the scaled calorie total when servings > 1', () => {
    const c = new Consumption({ occurredAt: at, nutrients: { calories: 150 }, servings: 2 })
    expect(consumptionMeta(c)).toBe(`150 kcal · 300 kcal total · ${formatClockTime(at)}`)
  })
  it('no total without calories', () => {
    const c = new Consumption({ occurredAt: at, nutrients: { protein: 5 }, servings: 3 })
    expect(consumptionMeta(c)).toBe(`5g P · ${formatClockTime(at)}`)
  })
})

describe('mealLabel', () => {
  const byId = new Map([['c1', 'Oatmeal']])
  it('prefers the catalog name, then the note, then "Meal"; appends ×N', () => {
    expect(mealLabel(new Consumption({ occurredAt: at, consumableId: 'c1' as never, nutrients: {} }), byId)).toBe('Oatmeal')
    expect(mealLabel(new Consumption({ occurredAt: at, note: 'Stir-fry', nutrients: {} }), byId)).toBe('Stir-fry')
    expect(mealLabel(new Consumption({ occurredAt: at, nutrients: {} }), byId)).toBe('Meal')
    expect(mealLabel(new Consumption({ occurredAt: at, consumableId: 'c1' as never, nutrients: {}, servings: 2 }), byId)).toBe('Oatmeal ×2')
  })
})

describe('tiles', () => {
  it('five tiles in order', () => {
    expect(TILES.map(([k]) => k)).toEqual(['calories', 'protein', 'totalCarbohydrate', 'totalFat', 'waterMl'])
    expect(NUTRIENT_FIELDS.map(([k]) => k)).toEqual(['calories', 'protein', 'totalCarbohydrate', 'totalFat', 'waterMl'])
  })
  it('tileValue rounds and dashes', () => {
    expect(tileValue({ calories: 1239.6 }, 'calories')).toBe('1240')
    expect(tileValue({}, 'protein')).toBe('—')
  })
})
