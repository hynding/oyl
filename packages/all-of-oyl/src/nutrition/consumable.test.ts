import { describe, expect, it } from 'vitest'
import { Consumable } from './consumable.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

describe('Consumable', () => {
  it('constructs with facts (canonical field)', () => {
    const oatmeal = new Consumable({ name: 'Oatmeal', facts: { calories: 150, protein: 5, totalCarbohydrate: 27, totalFat: 3 } })
    expect(oatmeal.name).toBe('Oatmeal')
    expect(oatmeal.facts.calories).toBe(150)
    expect(oatmeal.facts.protein).toBe(5)
    expect(Id.of(oatmeal.id)).toBe(oatmeal.id)
  })

  it('constructs with slug', () => {
    const oatmeal = new Consumable({ name: 'Oatmeal', facts: { calories: 150 }, slug: 'oatmeal' })
    expect(oatmeal.slug).toBe('oatmeal')
  })

  it('rejects invalid slug', () => {
    let caught: unknown
    try {
      new Consumable({ name: 'Oatmeal', facts: { calories: 150 }, slug: 'Bad Slug!' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_SLUG')
  })

  it('constructs with ingredients and allergens', () => {
    const oatmeal = new Consumable({
      name: 'Oatmeal',
      facts: { calories: 150 },
      ingredients: ['whole grain rolled oats'],
      allergens: ['oats'],
    })
    expect(oatmeal.ingredients).toEqual(['whole grain rolled oats'])
    expect(oatmeal.allergens).toEqual(['oats'])
  })

  it('rejects negative or non-finite nutrient values', () => {
    for (const facts of [{ calories: -1 }, { protein: NaN }, { waterMl: Infinity }]) {
      let caught: unknown
      try {
        new Consumable({ name: 'Bad', facts })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('throws if facts not provided', () => {
    let caught: unknown
    try {
      // @ts-expect-error intentional bad input for runtime guard test
      new Consumable({ name: 'Bad' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })

  it('round-trips JSON with facts field', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Oatmeal',
      slug: 'oatmeal',
      facts: { calories: 150, protein: 5 },
      ingredients: ['whole grain rolled oats'],
      allergens: ['oats'],
    }
    expect(Consumable.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Oatmeal',
      facts: { calories: 150, protein: 5 },
      futureField: 'x',
    }
    expect(Consumable.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('fromJSON throws MALFORMED_JSON for legacy nutrients-only shape (facts is now required)', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Oatmeal',
      nutrients: { calories: 150, protein: 5 },
    }
    let caught: unknown
    try {
      Consumable.fromJSON(shape)
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: '00000000-0000-4000-8000-000000000031', name: 'Oatmeal' }, { id: '00000000-0000-4000-8000-000000000031', name: 'Oatmeal', facts: { calories: 'lots' } }]) {
      let caught: unknown
      try {
        Consumable.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
