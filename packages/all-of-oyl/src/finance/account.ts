import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** A money account ("Checking", "Visa"). Transactions may reference one. */
export class Account {
  readonly id: Id
  readonly name: string
  readonly currency: string
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; currency: string }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    if (!/^[A-Z]{3}$/.test(props.currency)) {
      throw new DomainError('INVALID_QUANTITY', `not an ISO currency code: "${props.currency}"`)
    }
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.currency = props.currency
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      currency: this.currency,
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Account {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not an Account shape')
    }
    const { id, name, currency, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || typeof currency !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not an Account shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `Account has a malformed id: "${id}"`)
    }
    const account = new Account({ id: parsedId, name, currency }, extra)
    if (meta !== undefined) account.meta = metaFromJSON(meta)
    return account
  }
}
