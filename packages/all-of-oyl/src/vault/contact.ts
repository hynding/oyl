// packages/all-of-oyl/src/vault/contact.ts
import { Cadence } from '../core/cadence.js'
import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import type { Due } from '../core/due.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'

/** A recurring date that matters: birthday = anchor day + yearly cadence. */
export type Occasion = { name: string; anchor: DayKey; cadence: Cadence }

/**
 * A person you care about. Occasions are recurring dues (next occurrence
 * relative to asOf — anchored, so Feb-29 birthdays clamp correctly);
 * staleness powers "you haven't talked to Sam in 3 months" nudges.
 */
export class Contact implements Due {
  readonly id: Id
  readonly name: string
  readonly occasions: readonly Occasion[]
  private lastContactedDay?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; name: string; lastContactedOn?: DayKey; occasions?: readonly Occasion[] },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    for (const occasion of props.occasions ?? []) {
      if (occasion.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'occasion name must be non-empty')
    }
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.occasions = (props.occasions ?? []).map((o) => ({ ...o }))
    if (props.lastContactedOn !== undefined) this.lastContactedDay = props.lastContactedOn
    this.extra = extra
  }

  get lastContactedOn(): DayKey | undefined {
    return this.lastContactedDay
  }

  recordContact(on: DayKey): void {
    this.lastContactedDay = on
  }

  /** Days since last contact as of `day`; undefined when never contacted. */
  staleness(day: DayKey): number | undefined {
    if (this.lastContactedDay === undefined) return undefined
    return Math.round(
      (Date.parse(`${day.value}T00:00:00Z`) - Date.parse(`${this.lastContactedDay.value}T00:00:00Z`)) / 86_400_000,
    )
  }

  /** The earliest upcoming occasion on or after asOf; undefined with no occasions. */
  nextDueOn(asOf: DayKey): DayKey | undefined {
    let earliest: DayKey | undefined
    for (const occasion of this.occasions) {
      const next = occasion.cadence.nextOnOrAfter(occasion.anchor, asOf)
      if (earliest === undefined || next.compare(earliest) < 0) earliest = next
    }
    return earliest
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      ...(this.lastContactedDay !== undefined ? { lastContactedOn: this.lastContactedDay.value } : {}),
      ...(this.occasions.length > 0
        ? { occasions: this.occasions.map((o) => ({ name: o.name, anchor: o.anchor.value, cadence: o.cadence.toJSON() })) }
        : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Contact {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Contact shape')
    }
    const { id, name, lastContactedOn, occasions, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      (lastContactedOn !== undefined && typeof lastContactedOn !== 'string') ||
      (occasions !== undefined && !Array.isArray(occasions))
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Contact shape')
    }
    try {
      const parsedOccasions: Occasion[] = (occasions ?? []).map((raw: unknown) => {
        const o = raw as { name?: unknown; anchor?: unknown; cadence?: unknown }
        if (typeof o?.name !== 'string' || typeof o?.anchor !== 'string' || o?.cadence === undefined) {
          throw new DomainError('MALFORMED_JSON', 'bad occasion')
        }
        return { name: o.name, anchor: DayKey.of(o.anchor), cadence: Cadence.fromJSON(o.cadence) }
      })
      const contact = new Contact(
        {
          id: Id.of(id),
          name,
          ...(lastContactedOn !== undefined ? { lastContactedOn: DayKey.of(lastContactedOn) } : {}),
          ...(parsedOccasions.length > 0 ? { occasions: parsedOccasions } : {}),
        },
        extra,
      )
      if (meta !== undefined) contact.meta = metaFromJSON(meta)
      return contact
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Contact shape')
      }
      throw e
    }
  }
}
