import { DomainError } from '../core/domain-error.js'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry.js'
import { Id } from '../core/id.js'
import { MetricKey } from '../core/metric-key.js'
import { NUTRIENT_METRICS, type NutritionFacts, assertNutritionFacts, nutritionFactsFromJSON, nutritionFactsToJSON } from './nutrients.js'

/**
 * Something you ate or drank. Always STORES its per-serving nutrients — a
 * snapshot from the Consumable at log time, or given directly for ad-hoc logging
 * (a restaurant meal). `consumableId` is provenance, not a requirement.
 */
export class Consumption extends Entry {
  readonly consumableId?: Id
  readonly consumableProductId?: Id
  readonly servings: number
  readonly nutrients: NutritionFacts
  readonly loggedAmount?: { amount: number; unit: string }
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      occurredAt: Date
      note?: string
      /** Catalog provenance + default nutrient source. */
      consumable?: { id: Id; nutrients: NutritionFacts }
      /** Bare provenance when reviving without the catalog at hand. */
      consumableId?: Id
      /** Bare product provenance. */
      consumableProductId?: Id
      /** Explicit per-serving nutrients (ad-hoc logging, or overrides the consumable's). */
      nutrients?: NutritionFacts
      /** Defaults to 1. */
      servings?: number
      /** The measured amount that was logged (e.g. 250 g). */
      loggedAmount?: { amount: number; unit: string }
    },
    extra: Record<string, unknown> = {},
  ) {
    const { consumable, consumableId, consumableProductId, nutrients, servings = 1, loggedAmount, ...base } = props
    super('consumption', base)
    const resolved = nutrients ?? consumable?.nutrients
    if (resolved === undefined) {
      throw new DomainError('INVALID_QUANTITY', 'a Consumption needs nutrients — from a consumable or given directly')
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      throw new DomainError('INVALID_QUANTITY', `servings must be a positive finite number, got ${servings}`)
    }
    if (consumable !== undefined && consumableId !== undefined && consumable.id !== consumableId) {
      throw new DomainError('INVALID_ID', `conflicting consumable provenance: ${consumable.id} vs ${consumableId}`)
    }
    const provenance = consumable?.id ?? consumableId
    if (provenance !== undefined) this.consumableId = provenance
    if (consumableProductId !== undefined) this.consumableProductId = consumableProductId
    this.servings = servings
    this.nutrients = { ...assertNutritionFacts(resolved) }
    if (loggedAmount !== undefined) this.loggedAmount = { amount: loggedAmount.amount, unit: loggedAmount.unit }
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
      ...(this.consumableId !== undefined ? { consumableId: this.consumableId } : {}),
      ...(this.consumableProductId !== undefined ? { consumableProductId: this.consumableProductId } : {}),
      servings: this.servings,
      nutrients: nutritionFactsToJSON(this.nutrients),
      ...(this.loggedAmount !== undefined ? { loggedAmount: { amount: this.loggedAmount.amount, unit: this.loggedAmount.unit } } : {}),
    }
  }

  static fromJSON(shape: unknown): Consumption {
    const base = parseEntryBase(shape, 'consumption')
    const { consumableId, consumableProductId, servings, nutrients, loggedAmount, ...extra } = base.rest
    if (typeof servings !== 'number' || nutrients === undefined || (consumableId !== undefined && typeof consumableId !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a consumption shape')
    }
    if (consumableProductId !== undefined && typeof consumableProductId !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'consumableProductId must be a string')
    }
    let parsedConsumableId: Id | undefined
    try {
      parsedConsumableId = consumableId !== undefined ? Id.of(consumableId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', `consumption has a malformed consumableId: "${consumableId}"`)
    }
    let parsedConsumableProductId: Id | undefined
    try {
      parsedConsumableProductId = consumableProductId !== undefined ? Id.of(consumableProductId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', `consumption has a malformed consumableProductId: "${consumableProductId}"`)
    }
    let parsedLoggedAmount: { amount: number; unit: string } | undefined
    if (loggedAmount !== undefined) {
      if (typeof loggedAmount !== 'object' || loggedAmount === null) {
        throw new DomainError('MALFORMED_JSON', 'loggedAmount must be an object')
      }
      const la = loggedAmount as Record<string, unknown>
      if (typeof la['amount'] !== 'number' || typeof la['unit'] !== 'string') {
        throw new DomainError('MALFORMED_JSON', 'loggedAmount must have numeric amount and string unit')
      }
      parsedLoggedAmount = { amount: la['amount'], unit: la['unit'] }
    }
    const meal = new Consumption(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        ...(parsedConsumableId !== undefined ? { consumableId: parsedConsumableId } : {}),
        ...(parsedConsumableProductId !== undefined ? { consumableProductId: parsedConsumableProductId } : {}),
        nutrients: nutritionFactsFromJSON(nutrients),
        servings,
        ...(parsedLoggedAmount !== undefined ? { loggedAmount: parsedLoggedAmount } : {}),
      },
      extra,
    )
    if (base.meta !== undefined) meal.meta = base.meta
    return meal
  }
}
