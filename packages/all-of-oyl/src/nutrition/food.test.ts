import { describe, expect, it } from 'vitest'
import { Food } from './food.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

describe('Food', () => {
  it('constructs with per-serving nutrients', () => {
    const oatmeal = new Food({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5, carbs: 27, fat: 3 } })
    expect(oatmeal.name).toBe('Oatmeal')
    expect(oatmeal.nutrients.calories).toBe(150)
    expect(Id.of(oatmeal.id)).toBe(oatmeal.id)
  })

  it('rejects negative or non-finite nutrient values', () => {
    for (const nutrients of [{ calories: -1 }, { protein: NaN }, { waterMl: Infinity }]) {
      let caught: unknown
      try {
        new Food({ name: 'Bad', nutrients })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Oatmeal',
      nutrients: { calories: 150, protein: 5 },
      futureField: 'x',
    }
    expect(Food.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: '00000000-0000-4000-8000-000000000031', name: 'Oatmeal' }, { id: '00000000-0000-4000-8000-000000000031', name: 'Oatmeal', nutrients: { calories: 'lots' } }]) {
      let caught: unknown
      try {
        Food.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
