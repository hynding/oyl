import { describe, expect, it } from 'vitest'
import { ConsumableProduct, effectiveFacts } from './consumable-product.js'
import { Consumable } from './consumable.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

describe('ConsumableProduct', () => {
  const consumableId = Id.of('00000000-0000-4000-8000-000000000001')

  it('constructs with required fields', () => {
    const p = new ConsumableProduct({ consumableId, name: 'Quaker Old Fashioned Oats 18oz' })
    expect(p.name).toBe('Quaker Old Fashioned Oats 18oz')
    expect(p.consumableId).toBe(consumableId)
    expect(Id.of(p.id)).toBe(p.id)
    expect(p.upc).toBeUndefined()
    expect(p.brand).toBeUndefined()
    expect(p.facts).toBeUndefined()
  })

  it('constructs with all optional fields', () => {
    const p = new ConsumableProduct({
      consumableId,
      name: 'Quaker Old Fashioned Oats 18oz',
      upc: '030000057247',
      brand: 'Quaker',
      netWeight: { amount: 510, unit: 'g' },
      servingsPerContainer: 19,
      facts: { calories: 150, protein: 5, totalCarbohydrate: 27, totalFat: 3 },
      ingredients: ['whole grain rolled oats'],
      allergens: ['oats'],
    })
    expect(p.upc).toBe('030000057247')
    expect(p.brand).toBe('Quaker')
    expect(p.netWeight).toEqual({ amount: 510, unit: 'g' })
    expect(p.servingsPerContainer).toBe(19)
    expect(p.facts?.calories).toBe(150)
    expect(p.ingredients).toEqual(['whole grain rolled oats'])
    expect(p.allergens).toEqual(['oats'])
  })

  it('rejects invalid facts when present', () => {
    let caught: unknown
    try {
      new ConsumableProduct({ consumableId, name: 'Bad', facts: { calories: -100 } })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON preserving all fields and unknown extra fields', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000031',
      consumableId: '00000000-0000-4000-8000-000000000001',
      name: 'Quaker Old Fashioned Oats 18oz',
      upc: '030000057247',
      brand: 'Quaker',
      netWeight: { amount: 510, unit: 'g' },
      servingsPerContainer: 19,
      facts: { calories: 150, protein: 5, totalCarbohydrate: 27, totalFat: 3 },
      ingredients: ['whole grain rolled oats'],
      allergens: ['oats'],
      futureField: 'preserved',
    }
    expect(ConsumableProduct.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('round-trips JSON with only required fields', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000031',
      consumableId: '00000000-0000-4000-8000-000000000001',
      name: 'Quaker Old Fashioned Oats 18oz',
    }
    expect(ConsumableProduct.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      null,
      { id: '00000000-0000-4000-8000-000000000031', name: 'X' }, // missing consumableId
      { id: '00000000-0000-4000-8000-000000000031', consumableId: '00000000-0000-4000-8000-000000000001' }, // missing name
      { id: 'not-a-uuid', consumableId: '00000000-0000-4000-8000-000000000001', name: 'X' }, // bad id
    ]) {
      let caught: unknown
      try {
        ConsumableProduct.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})

describe('effectiveFacts', () => {
  const consumableId = Id.of('00000000-0000-4000-8000-000000000001')

  it('returns product facts when present', () => {
    const product = new ConsumableProduct({
      consumableId,
      name: 'Brand Oats',
      facts: { calories: 160, protein: 6 },
    })
    const consumable = new Consumable({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5 } })
    const result = effectiveFacts(product, consumable)
    expect(result.calories).toBe(160)
    expect(result.protein).toBe(6)
  })

  it('falls back to consumable facts when product has none', () => {
    const product = new ConsumableProduct({ consumableId, name: 'Brand Oats' })
    const consumable = new Consumable({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5 } })
    const result = effectiveFacts(product, consumable)
    expect(result.calories).toBe(150)
    expect(result.protein).toBe(5)
  })

  it('returns undefined when neither product nor consumable has facts', () => {
    const product = new ConsumableProduct({ consumableId, name: 'Brand Oats' })
    const result = effectiveFacts(product, undefined)
    expect(result).toBeUndefined()
  })
})
