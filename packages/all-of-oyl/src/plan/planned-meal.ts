import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { Plan, parsePlanBase, planBaseJSON } from '../core/plan.js'

/**
 * What you intend to eat on a day; fulfilled by a Consumption. References a
 * Consumable by id (a full Consumable works — structural). The grocery list aggregates
 * servings per consumable id across a range's planned meals.
 */
export class PlannedMeal extends Plan {
  /** Always equals `due` — a domain-named alias wired from one constructor source. */
  readonly day: DayKey
  readonly consumableId: Id
  readonly servings: number
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      title: string
      day: DayKey
      /** A full Consumable works; reviving passes the stored snapshot id. */
      consumable?: { id: Id }
      consumableId?: Id
      servings?: number
    },
    extra: Record<string, unknown> = {},
  ) {
    const { day, consumable, consumableId, servings = 1, ...base } = props
    super('planned-meal', { ...base, due: day })
    if (consumable !== undefined && consumableId !== undefined && consumable.id !== consumableId) {
      throw new DomainError('INVALID_ID', `conflicting consumable provenance: ${consumable.id} vs ${consumableId}`)
    }
    const resolved = consumable?.id ?? consumableId
    if (resolved === undefined) {
      throw new DomainError('INVALID_ID', 'a planned meal references a consumable')
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      throw new DomainError('INVALID_QUANTITY', `servings must be a positive finite number, got ${servings}`)
    }
    this.day = day
    this.consumableId = resolved
    this.servings = servings
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...planBaseJSON(this),
      consumableId: this.consumableId,
      servings: this.servings,
    }
  }

  static fromJSON(shape: unknown): PlannedMeal {
    const base = parsePlanBase(shape, 'planned-meal')
    const { consumableId, servings, ...extra } = base.rest
    if (typeof consumableId !== 'string' || typeof servings !== 'number' || base.due === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a planned-meal shape')
    }
    let parsedConsumableId: Id
    try {
      parsedConsumableId = Id.of(consumableId)
    } catch {
      throw new DomainError('MALFORMED_JSON', `planned-meal has a malformed consumableId: "${consumableId}"`)
    }
    const meal = new PlannedMeal(
      { id: base.id, title: base.title, day: base.due, consumableId: parsedConsumableId, servings },
      extra,
    )
    meal.adoptBase(base)
    return meal
  }
}
