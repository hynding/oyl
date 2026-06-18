import { DomainError } from '../core/domain-error.js'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry.js'
import { Id } from '../core/id.js'
import { MetricKey } from '../core/metric-key.js'
import { NUTRIENT_METRICS, type Nutrients, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './nutrients.js'

/**
 * Something you ate or drank. Always STORES its per-serving nutrients — a
 * snapshot from the Food at log time, or given directly for ad-hoc logging
 * (a restaurant meal). `foodId` is provenance, not a requirement.
 */
export class Consumption extends Entry {
  readonly foodId?: Id
  readonly servings: number
  readonly nutrients: Nutrients
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      occurredAt: Date
      note?: string
      /** Catalog provenance + default nutrient source. */
      food?: { id: Id; nutrients: Nutrients }
      /** Bare provenance when reviving without the catalog at hand. */
      foodId?: Id
      /** Explicit per-serving nutrients (ad-hoc logging, or overrides the food's). */
      nutrients?: Nutrients
      /** Defaults to 1. */
      servings?: number
    },
    extra: Record<string, unknown> = {},
  ) {
    const { food, foodId, nutrients, servings = 1, ...base } = props
    super('consumption', base)
    const resolved = nutrients ?? food?.nutrients
    if (resolved === undefined) {
      throw new DomainError('INVALID_QUANTITY', 'a Consumption needs nutrients — from a food or given directly')
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      throw new DomainError('INVALID_QUANTITY', `servings must be a positive finite number, got ${servings}`)
    }
    if (food !== undefined && foodId !== undefined && food.id !== foodId) {
      throw new DomainError('INVALID_ID', `conflicting food provenance: ${food.id} vs ${foodId}`)
    }
    const provenance = food?.id ?? foodId
    if (provenance !== undefined) this.foodId = provenance
    this.servings = servings
    this.nutrients = { ...assertNutrients(resolved) }
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    const m = new Map<MetricKey, number>()
    for (const [field, metric] of NUTRIENT_METRICS) {
      const v = this.nutrients[field]
      if (v !== undefined) m.set(MetricKey.of(metric), v * this.servings)
    }
    return m
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      ...(this.foodId !== undefined ? { foodId: this.foodId } : {}),
      servings: this.servings,
      nutrients: nutrientsToJSON(this.nutrients),
    }
  }

  static fromJSON(shape: unknown): Consumption {
    const base = parseEntryBase(shape, 'consumption')
    const { foodId, servings, nutrients, ...extra } = base.rest
    if (typeof servings !== 'number' || nutrients === undefined || (foodId !== undefined && typeof foodId !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a consumption shape')
    }
    let parsedFoodId: Id | undefined
    try {
      parsedFoodId = foodId !== undefined ? Id.of(foodId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', `consumption has a malformed foodId: "${foodId}"`)
    }
    const meal = new Consumption(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        ...(parsedFoodId !== undefined ? { foodId: parsedFoodId } : {}),
        nutrients: nutrientsFromJSON(nutrients),
        servings,
      },
      extra,
    )
    if (base.meta !== undefined) meal.meta = base.meta
    return meal
  }
}
