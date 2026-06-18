import { DomainError } from '../core/domain-error.js'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry.js'
import { Id } from '../core/id.js'
import { MetricKey } from '../core/metric-key.js'
import { NUTRIENT_METRICS, type Nutrients, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './nutrients.js'

/**
 * Something you ate or drank. Always STORES its per-serving nutrients — a
 * snapshot from the Consumable at log time, or given directly for ad-hoc logging
 * (a restaurant meal). `consumableId` is provenance, not a requirement.
 */
export class Consumption extends Entry {
  readonly consumableId?: Id
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
      consumable?: { id: Id; nutrients: Nutrients }
      /** Bare provenance when reviving without the catalog at hand. */
      consumableId?: Id
      /** Explicit per-serving nutrients (ad-hoc logging, or overrides the consumable's). */
      nutrients?: Nutrients
      /** Defaults to 1. */
      servings?: number
    },
    extra: Record<string, unknown> = {},
  ) {
    const { consumable, consumableId, nutrients, servings = 1, ...base } = props
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
      ...(this.consumableId !== undefined ? { consumableId: this.consumableId } : {}),
      servings: this.servings,
      nutrients: nutrientsToJSON(this.nutrients),
    }
  }

  static fromJSON(shape: unknown): Consumption {
    const base = parseEntryBase(shape, 'consumption')
    const { consumableId, servings, nutrients, ...extra } = base.rest
    if (typeof servings !== 'number' || nutrients === undefined || (consumableId !== undefined && typeof consumableId !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a consumption shape')
    }
    let parsedConsumableId: Id | undefined
    try {
      parsedConsumableId = consumableId !== undefined ? Id.of(consumableId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', `consumption has a malformed consumableId: "${consumableId}"`)
    }
    const meal = new Consumption(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        ...(parsedConsumableId !== undefined ? { consumableId: parsedConsumableId } : {}),
        nutrients: nutrientsFromJSON(nutrients),
        servings,
      },
      extra,
    )
    if (base.meta !== undefined) meal.meta = base.meta
    return meal
  }
}
