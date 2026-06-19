import { describe, expect, it } from 'vitest'
import { Consumable } from './consumable.js'
import { Consumption } from './consumption.js'
import { Id } from '../core/id.js'
import { MetricKey } from '../core/metric-key.js'
import { DomainError } from '../core/domain-error.js'

const oatmeal = new Consumable({
  id: Id.of('00000000-0000-4000-8000-000000000031'),
  name: 'Oatmeal',
  nutrients: { calories: 150, protein: 5, waterMl: 10 },
})
const when = new Date('2026-06-01T12:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('Consumption', () => {
  it('snapshots consumable nutrients and emits × servings', () => {
    const meal = new Consumption({ occurredAt: when, consumable: oatmeal, servings: 2 })
    expect(meal.kind).toBe('consumption')
    expect(meal.consumableId).toBe(oatmeal.id)
    expect(meal.servings).toBe(2)
    expect(meal.metrics().get(key('nutrition.calories'))).toBe(300)
    expect(meal.metrics().get(key('nutrition.protein'))).toBe(10)
    expect(meal.metrics().get(key('nutrition.water_ml'))).toBe(20)
    expect(meal.metrics().has(key('nutrition.total_carbohydrate'))).toBe(false)
  })

  it('supports ad-hoc logging with no consumable (consumableId is provenance, not a requirement)', () => {
    const restaurant = new Consumption({ occurredAt: when, nutrients: { calories: 850, totalFat: 40 } })
    expect(restaurant.consumableId).toBeUndefined()
    expect(restaurant.servings).toBe(1)
    expect(restaurant.metrics().get(key('nutrition.calories'))).toBe(850)
    expect(restaurant.metrics().get(key('nutrition.total_fat'))).toBe(40)
  })

  it('explicit nutrients override the consumable snapshot', () => {
    const tweaked = new Consumption({ occurredAt: when, consumable: oatmeal, nutrients: { calories: 100 } })
    expect(tweaked.metrics().get(key('nutrition.calories'))).toBe(100)
    expect(tweaked.consumableId).toBe(oatmeal.id)
  })

  it('requires nutrients from somewhere, and a positive serving count', () => {
    let caught1: unknown
    try {
      new Consumption({ occurredAt: when })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_QUANTITY')

    for (const servings of [0, -1, NaN]) {
      let caught: unknown
      try {
        new Consumption({ occurredAt: when, consumable: oatmeal, servings })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('round-trips JSON (incl. ad-hoc) with unknown fields preserved', () => {
    const meal = new Consumption({
      id: Id.of('00000000-0000-4000-8000-000000000101'),
      occurredAt: when,
      consumable: oatmeal,
      servings: 1.5,
    })
    const revived = Consumption.fromJSON({ ...meal.toJSON(), futureField: 2 })
    expect(revived.consumableId).toBe(oatmeal.id)
    expect(revived.servings).toBe(1.5)
    expect(revived.metrics().get(key('nutrition.calories'))).toBe(225)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(2)

    const adHoc = new Consumption({ occurredAt: when, nutrients: { calories: 850 } })
    const revivedAdHoc = Consumption.fromJSON(adHoc.toJSON())
    expect(revivedAdHoc.consumableId).toBeUndefined()
    expect(revivedAdHoc.metrics().get(key('nutrition.calories'))).toBe(850)
  })

  it('rejects conflicting consumable provenance', () => {
    let caught: unknown
    try {
      new Consumption({ occurredAt: when, consumable: oatmeal, consumableId: Id.of('00000000-0000-4000-8000-000000000099') })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_ID')
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'consumption', id: '00000000-0000-4000-8000-000000000101', occurredAt: when.toISOString(), servings: 1 }, // no nutrients
      { kind: 'note', id: '00000000-0000-4000-8000-000000000101', occurredAt: when.toISOString(), servings: 1, nutrients: { calories: 1 } }, // wrong kind
      { kind: 'consumption', id: '00000000-0000-4000-8000-000000000101', occurredAt: when.toISOString(), servings: 1, nutrients: { calories: 1 }, consumableId: 'nope' }, // malformed consumableId
    ]) {
      let caught: unknown
      try {
        Consumption.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })

  it('round-trips consumableProductId and loggedAmount', () => {
    const productId = Id.of('00000000-0000-4000-8000-000000000202')
    const meal = new Consumption({
      id: Id.of('00000000-0000-4000-8000-000000000201'),
      occurredAt: when,
      nutrients: { calories: 200, protein: 10, totalFat: 5, sodium: 150 },
      servings: 2,
      consumableProductId: productId,
      loggedAmount: { amount: 250, unit: 'g' },
    })
    expect(meal.consumableProductId).toBe(productId)
    expect(meal.loggedAmount).toEqual({ amount: 250, unit: 'g' })
    // metrics: per-serving × servings
    expect(meal.metrics().get(key('nutrition.calories'))).toBe(400)
    expect(meal.metrics().get(key('nutrition.protein'))).toBe(20)

    // round-trip
    const revived = Consumption.fromJSON(meal.toJSON())
    expect(revived.consumableProductId?.value).toBe(productId.value)
    expect(revived.loggedAmount).toEqual({ amount: 250, unit: 'g' })
    expect(revived.servings).toBe(2)
    expect(revived.metrics().get(key('nutrition.calories'))).toBe(400)
  })

  it('accepts fractional servings with consumableProductId', () => {
    const meal = new Consumption({
      occurredAt: when,
      nutrients: { protein: 20 },
      servings: 1.5,
      consumableProductId: Id.of('00000000-0000-4000-8000-000000000203'),
    })
    expect(meal.servings).toBe(1.5)
    expect(meal.metrics().get(key('nutrition.protein'))).toBeCloseTo(30)
  })

  it('throws MALFORMED_JSON on malformed consumableProductId', () => {
    for (const shape of [
      // non-string consumableProductId
      {
        kind: 'consumption',
        id: '00000000-0000-4000-8000-000000000201',
        occurredAt: when.toISOString(),
        servings: 1,
        nutrients: { calories: 100 },
        consumableProductId: 42,
      },
      // unparseable string consumableProductId
      {
        kind: 'consumption',
        id: '00000000-0000-4000-8000-000000000201',
        occurredAt: when.toISOString(),
        servings: 1,
        nutrients: { calories: 100 },
        consumableProductId: 'not-a-uuid',
      },
    ]) {
      let caught: unknown
      try {
        Consumption.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })

  it('throws MALFORMED_JSON on malformed loggedAmount', () => {
    for (const shape of [
      // amount is not a number
      {
        kind: 'consumption',
        id: '00000000-0000-4000-8000-000000000201',
        occurredAt: when.toISOString(),
        servings: 1,
        nutrients: { calories: 100 },
        loggedAmount: { amount: 'x', unit: 'g' },
      },
      // unit is not a string
      {
        kind: 'consumption',
        id: '00000000-0000-4000-8000-000000000201',
        occurredAt: when.toISOString(),
        servings: 1,
        nutrients: { calories: 100 },
        loggedAmount: { amount: 100, unit: 42 },
      },
      // not an object
      {
        kind: 'consumption',
        id: '00000000-0000-4000-8000-000000000201',
        occurredAt: when.toISOString(),
        servings: 1,
        nutrients: { calories: 100 },
        loggedAmount: 'not-an-object',
      },
    ]) {
      let caught: unknown
      try {
        Consumption.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
