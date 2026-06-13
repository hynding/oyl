import { describe, expect, it } from 'vitest'
import { PlannedMeal } from './planned-meal.js'
import { DayKey } from '../core/day-key.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

const day = (s: string) => DayKey.of(s)
const foodId = Id.of('00000000-0000-4000-8000-000000000031')

describe('PlannedMeal', () => {
  it('is a plan due on its day, referencing a food with servings', () => {
    const meal = new PlannedMeal({ title: 'Oatmeal breakfast', day: day('2026-06-02'), food: { id: foodId }, servings: 1.5 })
    expect(meal.kind).toBe('planned-meal')
    expect(meal.due?.value).toBe('2026-06-02')
    expect(meal.day.value).toBe('2026-06-02')
    expect(meal.foodId).toBe(foodId)
    expect(meal.servings).toBe(1.5)
  })

  it('defaults servings to 1 and validates', () => {
    expect(new PlannedMeal({ title: 'Oatmeal', day: day('2026-06-02'), food: { id: foodId } }).servings).toBe(1)
    for (const servings of [0, -1, NaN]) {
      let caught: unknown
      try {
        new PlannedMeal({ title: 'Oatmeal', day: day('2026-06-02'), food: { id: foodId }, servings })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('rejects conflicting food provenance', () => {
    let caught: unknown
    try {
      new PlannedMeal({ title: 'Oatmeal', day: day('2026-06-02'), food: { id: foodId }, foodId: Id.of('00000000-0000-4000-8000-000000000099') })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_ID')
  })

  it('round-trips JSON and can be fulfilled by a consumption', () => {
    const meal = new PlannedMeal({ id: Id.of('00000000-0000-4000-8000-000000001007'), title: 'Oatmeal breakfast', day: day('2026-06-02'), food: { id: foodId } })
    meal.complete(day('2026-06-02'), Id.of('00000000-0000-4000-8000-000000000101'))
    const revived = PlannedMeal.fromJSON({ ...meal.toJSON(), futureField: 11 })
    expect(revived.status).toBe('done')
    expect(revived.foodId).toBe(foodId)
    expect(revived.fulfilledBy).toEqual(meal.fulfilledBy)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(11)
    expect(PlannedMeal.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'planned-meal', id: '00000000-0000-4000-8000-000000001007', title: 'x', status: 'open' }, // no due/foodId/servings
      { kind: 'planned-meal', id: '00000000-0000-4000-8000-000000001007', title: 'x', status: 'open', due: '2026-06-02', servings: 1, foodId: 'nope' },
    ]) {
      let caught: unknown
      try {
        PlannedMeal.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
