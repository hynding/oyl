import { assertTimezone } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

export type Units = 'metric' | 'imperial'

/**
 * The person's profile, not their credentials. Authentication identity is
 * the backend's record, linked by id. `timezone` is the value every root
 * is hydrated with.
 */
export class User {
  readonly id: Id
  readonly displayName: string
  readonly timezone: string
  readonly defaultCurrency: string
  readonly units?: Units
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; displayName: string; timezone: string; defaultCurrency: string; units?: Units },
    extra: Record<string, unknown> = {},
  ) {
    if (props.displayName.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'displayName must be non-empty')
    }
    if (!/^[A-Z]{3}$/.test(props.defaultCurrency)) {
      throw new DomainError('INVALID_QUANTITY', `not an ISO currency code: "${props.defaultCurrency}"`)
    }
    this.id = props.id ?? Id.create()
    this.displayName = props.displayName
    this.timezone = assertTimezone(props.timezone)
    this.defaultCurrency = props.defaultCurrency
    if (props.units !== undefined) this.units = props.units
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      displayName: this.displayName,
      timezone: this.timezone,
      defaultCurrency: this.defaultCurrency,
      ...(this.units !== undefined ? { units: this.units } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): User {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a User shape')
    }
    const { id, displayName, timezone, defaultCurrency, units, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof displayName !== 'string' ||
      typeof timezone !== 'string' ||
      typeof defaultCurrency !== 'string' ||
      (units !== undefined && units !== 'metric' && units !== 'imperial')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a User shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `User has malformed id: "${id}"`)
    }
    const user = new User(
      { id: parsedId, displayName, timezone, defaultCurrency, ...(units !== undefined ? { units: units as Units } : {}) },
      extra,
    )
    if (meta !== undefined) user.meta = metaFromJSON(meta)
    return user
  }
}
