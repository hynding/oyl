import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'
import type { DayKey } from '../core/day-key.js'
import type { Journal } from '../core/journal.js'
import { DayRange } from '../core/day-range.js'
import { Money } from '../core/money.js'
import { Transaction } from './transaction.js'

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

  /**
   * This account's transactions within `range`, in this account's currency.
   * The currency filter is NOT redundant: `Transaction` only enforces a
   * currency match when constructed with the full `account` object; a bare
   * `accountId` skips that check — so this guard keeps mismatched postings out.
   */
  private postingsIn(journal: Journal, range: DayRange): Transaction[] {
    return journal
      .entriesIn(range)
      .filter(
        (e): e is Transaction =>
          e instanceof Transaction && e.accountId === this.id && e.amount.currency === this.currency,
      )
  }

  /**
   * All-time balance: income minus expense over every recorded transaction in
   * this account's currency. Net-of-recorded — no opening-balance field exists.
   */
  balanceIn(journal: Journal): Money {
    const zero = Money.fromMajor(0, this.currency)
    const span = journal.span()
    if (!span) return zero
    return this.postingsIn(journal, span).reduce(
      (bal, t) => (t.direction === 'income' ? bal.add(t.amount) : bal.subtract(t.amount)),
      zero,
    )
  }

  /** This-month expense total for this account (Money in the account's currency). */
  spentIn(journal: Journal, day: DayKey): Money {
    const range = DayRange.of(day.startOfMonth(), day.endOfMonth())
    return this.postingsIn(journal, range)
      .filter((t) => t.direction === 'expense')
      .reduce((sum, t) => sum.add(t.amount), Money.fromMajor(0, this.currency))
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
