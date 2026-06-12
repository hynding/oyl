import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** Per-serving nutrient values. Only present fields are emitted as metrics. */
export type Nutrients = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  waterMl?: number
}

/** Field → metric key. The one place the mapping lives. */
export const NUTRIENT_METRICS: ReadonlyArray<readonly [keyof Nutrients, string]> = [
  ['calories', 'nutrition.calories'],
  ['protein', 'nutrition.protein'],
  ['carbs', 'nutrition.carbs'],
  ['fat', 'nutrition.fat'],
  ['waterMl', 'nutrition.water_ml'],
]

export function assertNutrients(n: Nutrients): Nutrients {
  for (const [field] of NUTRIENT_METRICS) {
    const v = n[field]
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
      throw new DomainError('INVALID_QUANTITY', `nutrient ${field} must be a non-negative finite number, got ${v}`)
    }
  }
  return n
}

export function nutrientsToJSON(n: Nutrients): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [field] of NUTRIENT_METRICS) {
    const v = n[field]
    if (v !== undefined) out[field] = v
  }
  return out
}

export function nutrientsFromJSON(shape: unknown): Nutrients {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', 'not a Nutrients shape')
  }
  const s = shape as Record<string, unknown>
  const out: Nutrients = {}
  for (const [field] of NUTRIENT_METRICS) {
    const v = s[field]
    if (v === undefined) continue
    if (typeof v !== 'number') throw new DomainError('MALFORMED_JSON', `nutrient ${field} must be a number`)
    out[field] = v
  }
  return assertNutrients(out)
}

/** A reusable food definition; nutrients are per serving. */
export class Food {
  readonly id: Id
  readonly name: string
  readonly nutrients: Nutrients
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; nutrients: Nutrients }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.nutrients = { ...assertNutrients(props.nutrients) }
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      nutrients: nutrientsToJSON(this.nutrients),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Food {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Food shape')
    }
    const { id, name, nutrients, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || nutrients === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a Food shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `Food has a malformed id: "${id}"`)
    }
    const food = new Food({ id: parsedId, name, nutrients: nutrientsFromJSON(nutrients) }, extra)
    if (meta !== undefined) food.meta = metaFromJSON(meta)
    return food
  }
}
