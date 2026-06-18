import { assertTimezone } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'

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
  readonly birthday?: string
  readonly weightKg?: number
  readonly heightCm?: number
  readonly gender?: string
  readonly location?: string
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id; displayName: string; timezone: string; defaultCurrency: string; units?: Units
      birthday?: string; weightKg?: number; heightCm?: number; gender?: string; location?: string
    },
    extra: Record<string, unknown> = {},
  ) {
    if (props.displayName.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'displayName must be non-empty')
    }
    if (!/^[A-Z]{3}$/.test(props.defaultCurrency)) {
      throw new DomainError('INVALID_QUANTITY', `not an ISO currency code: "${props.defaultCurrency}"`)
    }
    if (props.birthday !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(props.birthday)) {
      throw new DomainError('INVALID_QUANTITY', `birthday must be YYYY-MM-DD: "${props.birthday}"`)
    }
    for (const [k, v] of [['weightKg', props.weightKg], ['heightCm', props.heightCm]] as const) {
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
        throw new DomainError('INVALID_QUANTITY', `${k} must be a positive number`)
      }
    }
    this.id = props.id ?? Id.create()
    this.displayName = props.displayName
    this.timezone = assertTimezone(props.timezone)
    this.defaultCurrency = props.defaultCurrency
    if (props.units !== undefined) this.units = props.units
    if (props.birthday !== undefined) this.birthday = props.birthday
    if (props.weightKg !== undefined) this.weightKg = props.weightKg
    if (props.heightCm !== undefined) this.heightCm = props.heightCm
    if (props.gender !== undefined) this.gender = props.gender
    if (props.location !== undefined) this.location = props.location
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
      ...(this.birthday !== undefined ? { birthday: this.birthday } : {}),
      ...(this.weightKg !== undefined ? { weightKg: this.weightKg } : {}),
      ...(this.heightCm !== undefined ? { heightCm: this.heightCm } : {}),
      ...(this.gender !== undefined ? { gender: this.gender } : {}),
      ...(this.location !== undefined ? { location: this.location } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): User {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a User shape')
    }
    const { id, displayName, timezone, defaultCurrency, units, meta,
      birthday, weightKg, heightCm, gender, location, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof displayName !== 'string' ||
      typeof timezone !== 'string' ||
      typeof defaultCurrency !== 'string' ||
      (units !== undefined && units !== 'metric' && units !== 'imperial') ||
      (birthday !== undefined && typeof birthday !== 'string') ||
      (weightKg !== undefined && typeof weightKg !== 'number') ||
      (heightCm !== undefined && typeof heightCm !== 'number') ||
      (gender !== undefined && typeof gender !== 'string') ||
      (location !== undefined && typeof location !== 'string')
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
      {
        id: parsedId, displayName, timezone, defaultCurrency,
        ...(units !== undefined ? { units: units as Units } : {}),
        ...(birthday !== undefined ? { birthday: birthday as string } : {}),
        ...(weightKg !== undefined ? { weightKg: weightKg as number } : {}),
        ...(heightCm !== undefined ? { heightCm: heightCm as number } : {}),
        ...(gender !== undefined ? { gender: gender as string } : {}),
        ...(location !== undefined ? { location: location as string } : {}),
      },
      extra,
    )
    if (meta !== undefined) user.meta = metaFromJSON(meta)
    return user
  }
}
