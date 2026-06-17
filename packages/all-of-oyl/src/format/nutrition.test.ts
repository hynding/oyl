import { describe, expect, it } from 'vitest'
import { formatNutrients } from './nutrition.js'

describe('formatNutrients', () => {
  it('formats present fields, omits absent, "" when empty', () => {
    expect(formatNutrients({ calories: 150, protein: 5, carbs: 27, fat: 3 })).toBe('150 kcal · 5g P · 27g C · 3g F')
    expect(formatNutrients({ calories: 150.6 })).toBe('151 kcal')
    expect(formatNutrients({ waterMl: 500 })).toBe('500 ml')
    expect(formatNutrients({})).toBe('')
  })
})
