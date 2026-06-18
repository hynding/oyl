import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'
import { type NutritionFacts, assertNutritionFacts, nutritionFactsFromJSON, nutritionFactsToJSON } from './nutrients.js'
import { type Consumable } from './consumable.js'

export interface NetWeight {
  amount: number
  unit: string
}

/**
 * A specific packaged product that corresponds to a catalog Consumable
 * (e.g. "Quaker Old Fashioned Oats 18oz" → "Oatmeal").
 * The optional `facts` field overrides the parent Consumable's nutrition facts
 * when the product has its own label values.
 */
export class ConsumableProduct {
  readonly id: Id
  readonly consumableId: Id
  readonly name: string
  readonly upc?: string
  readonly brand?: string
  readonly netWeight?: NetWeight
  readonly servingsPerContainer?: number
  /** Optional per-serving nutrition facts override. When absent, defer to the parent Consumable. */
  readonly facts?: NutritionFacts
  readonly ingredients?: readonly string[]
  readonly allergens?: readonly string[]
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      consumableId: Id
      name: string
      upc?: string
      brand?: string
      netWeight?: NetWeight
      servingsPerContainer?: number
      facts?: NutritionFacts
      ingredients?: readonly string[]
      allergens?: readonly string[]
    },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.consumableId = props.consumableId
    this.name = props.name
    if (props.upc !== undefined) this.upc = props.upc
    if (props.brand !== undefined) this.brand = props.brand
    if (props.netWeight !== undefined) this.netWeight = { ...props.netWeight }
    if (props.servingsPerContainer !== undefined) this.servingsPerContainer = props.servingsPerContainer
    if (props.facts !== undefined) this.facts = { ...assertNutritionFacts(props.facts) }
    if (props.ingredients !== undefined) this.ingredients = [...props.ingredients]
    if (props.allergens !== undefined) this.allergens = [...props.allergens]
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      consumableId: this.consumableId,
      name: this.name,
      ...(this.upc !== undefined ? { upc: this.upc } : {}),
      ...(this.brand !== undefined ? { brand: this.brand } : {}),
      ...(this.netWeight !== undefined ? { netWeight: { ...this.netWeight } } : {}),
      ...(this.servingsPerContainer !== undefined ? { servingsPerContainer: this.servingsPerContainer } : {}),
      ...(this.facts !== undefined ? { facts: nutritionFactsToJSON(this.facts) } : {}),
      ...(this.ingredients !== undefined ? { ingredients: [...this.ingredients] } : {}),
      ...(this.allergens !== undefined ? { allergens: [...this.allergens] } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): ConsumableProduct {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a ConsumableProduct shape')
    }
    const { id, consumableId, name, upc, brand, netWeight, servingsPerContainer, facts, ingredients, allergens, meta, ...extra } =
      shape as Record<string, unknown>

    if (typeof id !== 'string' || typeof consumableId !== 'string' || typeof name !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not a ConsumableProduct shape')
    }

    let parsedId: Id
    let parsedConsumableId: Id
    try {
      parsedId = Id.of(id)
      parsedConsumableId = Id.of(consumableId)
    } catch {
      throw new DomainError('MALFORMED_JSON', 'ConsumableProduct has a malformed id')
    }

    // Parse optional netWeight
    let parsedNetWeight: NetWeight | undefined
    if (netWeight !== undefined) {
      if (typeof netWeight !== 'object' || netWeight === null) {
        throw new DomainError('MALFORMED_JSON', 'netWeight must be an object')
      }
      const nw = netWeight as Record<string, unknown>
      if (typeof nw['amount'] !== 'number' || typeof nw['unit'] !== 'string') {
        throw new DomainError('MALFORMED_JSON', 'netWeight must have numeric amount and string unit')
      }
      parsedNetWeight = { amount: nw['amount'], unit: nw['unit'] }
    }

    const parsedIngredients =
      ingredients !== undefined
        ? Array.isArray(ingredients) && ingredients.every((v) => typeof v === 'string')
          ? (ingredients as string[])
          : (() => { throw new DomainError('MALFORMED_JSON', 'ingredients must be an array of strings') })()
        : undefined

    const parsedAllergens =
      allergens !== undefined
        ? Array.isArray(allergens) && allergens.every((v) => typeof v === 'string')
          ? (allergens as string[])
          : (() => { throw new DomainError('MALFORMED_JSON', 'allergens must be an array of strings') })()
        : undefined

    const product = new ConsumableProduct(
      {
        id: parsedId,
        consumableId: parsedConsumableId,
        name,
        ...(typeof upc === 'string' ? { upc } : {}),
        ...(typeof brand === 'string' ? { brand } : {}),
        ...(parsedNetWeight !== undefined ? { netWeight: parsedNetWeight } : {}),
        ...(typeof servingsPerContainer === 'number' ? { servingsPerContainer } : {}),
        ...(facts !== undefined ? { facts: nutritionFactsFromJSON(facts) } : {}),
        ...(parsedIngredients !== undefined ? { ingredients: parsedIngredients } : {}),
        ...(parsedAllergens !== undefined ? { allergens: parsedAllergens } : {}),
      },
      extra,
    )
    if (meta !== undefined) product.meta = metaFromJSON(meta)
    return product
  }
}

/**
 * Returns the effective per-serving NutritionFacts for a product:
 * the product's own facts override if present, else the parent consumable's,
 * else undefined.
 */
export function effectiveFacts(product: ConsumableProduct, consumable: Consumable | undefined): NutritionFacts | undefined {
  return product.facts ?? consumable?.facts
}
