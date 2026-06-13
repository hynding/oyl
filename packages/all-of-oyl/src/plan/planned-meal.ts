import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { Plan, parsePlanBase, planBaseJSON } from '../core/plan.js'

/**
 * What you intend to eat on a day; fulfilled by a Consumption. References a
 * Food by id (a full Food works — structural). The grocery list aggregates
 * servings per food id across a range's planned meals.
 */
export class PlannedMeal extends Plan {
  /** Always equals `due` — a domain-named alias wired from one constructor source. */
  readonly day: DayKey
  readonly foodId: Id
  readonly servings: number
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      title: string
      day: DayKey
      /** A full Food works; reviving passes the stored snapshot id. */
      food?: { id: Id }
      foodId?: Id
      servings?: number
    },
    extra: Record<string, unknown> = {},
  ) {
    const { day, food, foodId, servings = 1, ...base } = props
    super('planned-meal', { ...base, due: day })
    if (food !== undefined && foodId !== undefined && food.id !== foodId) {
      throw new DomainError('INVALID_ID', `conflicting food provenance: ${food.id} vs ${foodId}`)
    }
    const resolved = food?.id ?? foodId
    if (resolved === undefined) {
      throw new DomainError('INVALID_ID', 'a planned meal references a food')
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      throw new DomainError('INVALID_QUANTITY', `servings must be a positive finite number, got ${servings}`)
    }
    this.day = day
    this.foodId = resolved
    this.servings = servings
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...planBaseJSON(this),
      foodId: this.foodId,
      servings: this.servings,
    }
  }

  static fromJSON(shape: unknown): PlannedMeal {
    const base = parsePlanBase(shape, 'planned-meal')
    const { foodId, servings, ...extra } = base.rest
    if (typeof foodId !== 'string' || typeof servings !== 'number' || base.due === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a planned-meal shape')
    }
    let parsedFoodId: Id
    try {
      parsedFoodId = Id.of(foodId)
    } catch {
      throw new DomainError('MALFORMED_JSON', `planned-meal has a malformed foodId: "${foodId}"`)
    }
    const meal = new PlannedMeal(
      { id: base.id, title: base.title, day: base.due, foodId: parsedFoodId, servings },
      extra,
    )
    meal.adoptBase(base)
    return meal
  }
}
