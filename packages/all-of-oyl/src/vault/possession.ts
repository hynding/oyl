import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import type { Due } from '../core/due'
import { Id } from '../core/id'
import { Money } from '../core/money'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/**
 * Something you own. Upkeep is NOT a vault concept — it's a recurring Task
 * carrying the possessionId (one recurrence-of-duty mechanism). The warranty
 * expiry is this item's fixed due.
 */
export class Possession implements Due {
  readonly id: Id
  readonly name: string
  readonly location?: string
  readonly warrantyUntil?: DayKey
  readonly purchasePrice?: Money
  readonly purchasedOn?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; name: string; location?: string; warrantyUntil?: DayKey; purchasePrice?: Money; purchasedOn?: DayKey },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    if (props.location !== undefined) this.location = props.location
    if (props.warrantyUntil !== undefined) this.warrantyUntil = props.warrantyUntil
    if (props.purchasePrice !== undefined) this.purchasePrice = props.purchasePrice
    if (props.purchasedOn !== undefined) this.purchasedOn = props.purchasedOn
    this.extra = extra
  }

  /** Fixed due: the warranty expiry. */
  nextDueOn(_asOf: DayKey): DayKey | undefined {
    return this.warrantyUntil
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      ...(this.location !== undefined ? { location: this.location } : {}),
      ...(this.warrantyUntil !== undefined ? { warrantyUntil: this.warrantyUntil.value } : {}),
      ...(this.purchasePrice !== undefined ? { purchasePrice: this.purchasePrice.toJSON() } : {}),
      ...(this.purchasedOn !== undefined ? { purchasedOn: this.purchasedOn.value } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Possession {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Possession shape')
    }
    const { id, name, location, warrantyUntil, purchasePrice, purchasedOn, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      (location !== undefined && typeof location !== 'string') ||
      (warrantyUntil !== undefined && typeof warrantyUntil !== 'string') ||
      (purchasedOn !== undefined && typeof purchasedOn !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Possession shape')
    }
    try {
      const item = new Possession(
        {
          id: Id.of(id),
          name,
          ...(location !== undefined ? { location } : {}),
          ...(warrantyUntil !== undefined ? { warrantyUntil: DayKey.of(warrantyUntil) } : {}),
          ...(purchasePrice !== undefined ? { purchasePrice: Money.fromJSON(purchasePrice) } : {}),
          ...(purchasedOn !== undefined ? { purchasedOn: DayKey.of(purchasedOn) } : {}),
        },
        extra,
      )
      if (meta !== undefined) item.meta = metaFromJSON(meta)
      return item
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Possession shape')
      }
      throw e
    }
  }
}
