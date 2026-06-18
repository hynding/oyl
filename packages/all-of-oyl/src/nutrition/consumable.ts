import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'
import { type Nutrients, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './nutrients.js'

/** A reusable consumable definition; nutrients are per serving. */
export class Consumable {
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

  static fromJSON(shape: unknown): Consumable {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Consumable shape')
    }
    const { id, name, nutrients, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || nutrients === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a Consumable shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `Consumable has a malformed id: "${id}"`)
    }
    const consumable = new Consumable({ id: parsedId, name, nutrients: nutrientsFromJSON(nutrients) }, extra)
    if (meta !== undefined) consumable.meta = metaFromJSON(meta)
    return consumable
  }
}
