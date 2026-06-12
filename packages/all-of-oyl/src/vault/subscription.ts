// packages/all-of-oyl/src/vault/subscription.ts
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import type { Due } from '../core/due'
import { Id } from '../core/id'
import { Money } from '../core/money'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'
import { assertSlug } from '../core/slug'

/**
 * What renew() hands the caller — the data a Transaction needs, as a plain
 * shape. Vault never imports finance types (the import rule outranks the
 * convenience); the app or barrel converts a charge into a Transaction and
 * adds it to the Journal.
 */
export type SubscriptionCharge = {
  amount: Money
  category: string
  direction: 'expense'
  accountId?: Id
  on: DayKey
}

/**
 * A recurring bill. Calendar cadence: occurrences are anchor-derived (a
 * schedule anchored on the 15th stays on the 15th; late renewals never
 * drift it), and the renewedThrough cursor makes a lapsed renewal surface
 * as a PAST pending date instead of silently skipping ahead.
 */
export class Subscription implements Due {
  readonly id: Id
  readonly name: string
  readonly amount: Money
  readonly cadence: Cadence
  readonly anchor: DayKey
  readonly category: string
  readonly accountId?: Id
  /** Cursor: the last occurrence already paid. Mutates via renew(). */
  private renewedThroughDay?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      name: string
      amount: Money
      cadence: Cadence
      anchor: DayKey
      renewedThrough?: DayKey
      category: string
      accountId?: Id
    },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    if (props.amount.minor <= 0) throw new DomainError('INVALID_QUANTITY', 'amount must be positive')
    if (props.renewedThrough !== undefined && props.renewedThrough.compare(props.anchor) < 0) {
      throw new DomainError('INVALID_RANGE', `renewedThrough ${props.renewedThrough.value} precedes anchor ${props.anchor.value}`)
    }
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.amount = props.amount
    this.cadence = props.cadence
    this.anchor = props.anchor
    this.category = assertSlug(props.category)
    if (props.accountId !== undefined) this.accountId = props.accountId
    if (props.renewedThrough !== undefined) this.renewedThroughDay = props.renewedThrough
    this.extra = extra
  }

  get renewedThrough(): DayKey | undefined {
    return this.renewedThroughDay
  }

  /** The first anchored occurrence after the cursor (the anchor itself if never renewed). */
  private pendingRenewal(): DayKey {
    if (this.renewedThroughDay === undefined) return this.anchor
    return this.cadence.nextOnOrAfter(this.anchor, this.renewedThroughDay.addDays(1))
  }

  /** Returns the pending occurrence EVEN WHEN PAST — a lapsed renewal must surface as overdue. */
  nextDueOn(_asOf: DayKey): DayKey | undefined {
    return this.pendingRenewal()
  }

  /** Pay the pending occurrence on `on`; the cursor stays anchored, so late payments never drift the schedule. */
  renew(on: DayKey): SubscriptionCharge {
    this.renewedThroughDay = this.pendingRenewal()
    return {
      amount: this.amount,
      category: this.category,
      direction: 'expense',
      ...(this.accountId !== undefined ? { accountId: this.accountId } : {}),
      on,
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      amount: this.amount.toJSON(),
      cadence: this.cadence.toJSON(),
      anchor: this.anchor.value,
      ...(this.renewedThroughDay !== undefined ? { renewedThrough: this.renewedThroughDay.value } : {}),
      category: this.category,
      ...(this.accountId !== undefined ? { accountId: this.accountId } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Subscription {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Subscription shape')
    }
    const { id, name, amount, cadence, anchor, renewedThrough, category, accountId, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      amount === undefined ||
      cadence === undefined ||
      typeof anchor !== 'string' ||
      (renewedThrough !== undefined && typeof renewedThrough !== 'string') ||
      typeof category !== 'string' ||
      (accountId !== undefined && typeof accountId !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Subscription shape')
    }
    try {
      const sub = new Subscription(
        {
          id: Id.of(id),
          name,
          amount: Money.fromJSON(amount),
          cadence: Cadence.fromJSON(cadence),
          anchor: DayKey.of(anchor),
          ...(renewedThrough !== undefined ? { renewedThrough: DayKey.of(renewedThrough) } : {}),
          category,
          ...(accountId !== undefined ? { accountId: Id.of(accountId) } : {}),
        },
        extra,
      )
      if (meta !== undefined) sub.meta = metaFromJSON(meta)
      return sub
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Subscription shape')
      }
      throw e
    }
  }
}
