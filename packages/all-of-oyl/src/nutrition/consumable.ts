import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'
import { assertSlug } from '../core/slug.js'
import { type NutritionFacts, assertNutritionFacts, nutritionFactsFromJSON, nutritionFactsToJSON } from './nutrients.js'

/** A reusable consumable definition; facts are per serving. */
export class Consumable {
  readonly id: Id
  readonly name: string
  readonly slug?: string
  /** Canonical per-serving nutrition facts. */
  readonly facts: NutritionFacts
  readonly ingredients?: readonly string[]
  readonly allergens?: readonly string[]
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      facts: NutritionFacts
      id?: Id
      name: string
      slug?: string
      ingredients?: readonly string[]
      allergens?: readonly string[]
    },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    if (props.facts === undefined) throw new DomainError('MALFORMED_JSON', 'Consumable requires facts')
    this.id = props.id ?? Id.create()
    this.name = props.name
    if (props.slug !== undefined) this.slug = assertSlug(props.slug)
    this.facts = { ...assertNutritionFacts(props.facts) }
    if (props.ingredients !== undefined) this.ingredients = [...props.ingredients]
    if (props.allergens !== undefined) this.allergens = [...props.allergens]
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      ...(this.slug !== undefined ? { slug: this.slug } : {}),
      facts: nutritionFactsToJSON(this.facts),
      ...(this.ingredients !== undefined ? { ingredients: [...this.ingredients] } : {}),
      ...(this.allergens !== undefined ? { allergens: [...this.allergens] } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Consumable {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Consumable shape')
    }
    const { id, name, slug, facts, ingredients, allergens, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || facts === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a Consumable shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `Consumable has a malformed id: "${id}"`)
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
    const consumable = new Consumable(
      {
        id: parsedId,
        name,
        ...(typeof slug === 'string' ? { slug } : {}),
        facts: nutritionFactsFromJSON(facts),
        ...(parsedIngredients !== undefined ? { ingredients: parsedIngredients } : {}),
        ...(parsedAllergens !== undefined ? { allergens: parsedAllergens } : {}),
      },
      extra,
    )
    if (meta !== undefined) consumable.meta = metaFromJSON(meta)
    return consumable
  }
}
