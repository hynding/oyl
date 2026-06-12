import { describe, expect, it } from 'vitest'
import { Food } from './food'
import { Consumption } from './consumption'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { DomainError } from '../core/domain-error'

const oatmeal = new Food({
  id: Id.of('00000000-0000-4000-8000-000000000031'),
  name: 'Oatmeal',
  nutrients: { calories: 150, protein: 5, waterMl: 10 },
})
const when = new Date('2026-06-01T12:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('Consumption', () => {
  it('snapshots food nutrients and emits × servings', () => {
    const meal = new Consumption({ occurredAt: when, food: oatmeal, servings: 2 })
    expect(meal.kind).toBe('consumption')
    expect(meal.foodId).toBe(oatmeal.id)
    expect(meal.servings).toBe(2)
    expect(meal.metrics().get(key('nutrition.calories'))).toBe(300)
    expect(meal.metrics().get(key('nutrition.protein'))).toBe(10)
    expect(meal.metrics().get(key('nutrition.water_ml'))).toBe(20)
    expect(meal.metrics().has(key('nutrition.carbs'))).toBe(false)
  })

  it('supports ad-hoc logging with no food (foodId is provenance, not a requirement)', () => {
    const restaurant = new Consumption({ occurredAt: when, nutrients: { calories: 850, fat: 40 } })
    expect(restaurant.foodId).toBeUndefined()
    expect(restaurant.servings).toBe(1)
    expect(restaurant.metrics().get(key('nutrition.calories'))).toBe(850)
  })

  it('explicit nutrients override the food snapshot', () => {
    const tweaked = new Consumption({ occurredAt: when, food: oatmeal, nutrients: { calories: 100 } })
    expect(tweaked.metrics().get(key('nutrition.calories'))).toBe(100)
    expect(tweaked.foodId).toBe(oatmeal.id)
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
        new Consumption({ occurredAt: when, food: oatmeal, servings })
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
      food: oatmeal,
      servings: 1.5,
    })
    const revived = Consumption.fromJSON({ ...meal.toJSON(), futureField: 2 })
    expect(revived.foodId).toBe(oatmeal.id)
    expect(revived.servings).toBe(1.5)
    expect(revived.metrics().get(key('nutrition.calories'))).toBe(225)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(2)

    const adHoc = new Consumption({ occurredAt: when, nutrients: { calories: 850 } })
    const revivedAdHoc = Consumption.fromJSON(adHoc.toJSON())
    expect(revivedAdHoc.foodId).toBeUndefined()
    expect(revivedAdHoc.metrics().get(key('nutrition.calories'))).toBe(850)
  })

  it('rejects conflicting food provenance', () => {
    let caught: unknown
    try {
      new Consumption({ occurredAt: when, food: oatmeal, foodId: Id.of('00000000-0000-4000-8000-000000000099') })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_ID')
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'consumption', id: '00000000-0000-4000-8000-000000000101', occurredAt: when.toISOString(), servings: 1 }, // no nutrients
      { kind: 'note', id: '00000000-0000-4000-8000-000000000101', occurredAt: when.toISOString(), servings: 1, nutrients: { calories: 1 } }, // wrong kind
      { kind: 'consumption', id: '00000000-0000-4000-8000-000000000101', occurredAt: when.toISOString(), servings: 1, nutrients: { calories: 1 }, foodId: 'nope' }, // malformed foodId
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
