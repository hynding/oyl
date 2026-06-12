import { DomainError } from '../core/domain-error'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { Money } from '../core/money'
import { assertSlug } from '../core/slug'

export type TransactionDirection = 'expense' | 'income'

/**
 * Money moved. Expenses emit finance.spend.<category>, income emits
 * finance.income.<category>, both in major units (the metric layer assumes
 * one working currency per journal). Negative expense = refund: spend
 * metrics are net-of-refunds by construction. `accountId` is optional
 * (cash spending); currency match is enforced when a full Account is given
 * at construction — revival trusts the validated wire data.
 */
export class Transaction extends Entry {
  readonly amount: Money
  readonly category: string
  readonly direction: TransactionDirection
  readonly accountId?: Id
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      occurredAt: Date
      note?: string
      amount: Money
      category: string
      direction: TransactionDirection
      /** Full account enforces the currency match. */
      account?: { id: Id; currency: string }
      /** Bare provenance when reviving without the catalog at hand. */
      accountId?: Id
    },
    extra: Record<string, unknown> = {},
  ) {
    const { amount, category, direction, account, accountId, ...base } = props
    super('transaction', base)
    if (account && account.currency !== amount.currency) {
      throw new DomainError('CURRENCY_MISMATCH', `transaction in ${amount.currency} cannot post to a ${account.currency} account`)
    }
    this.amount = amount
    this.category = assertSlug(category)
    this.direction = direction
    if (account !== undefined && accountId !== undefined && account.id !== accountId) {
      throw new DomainError('INVALID_ID', `conflicting account provenance: ${account.id} vs ${accountId}`)
    }
    const provenance = account?.id ?? accountId
    if (provenance !== undefined) this.accountId = provenance
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    const channel = this.direction === 'expense' ? 'spend' : 'income'
    return new Map([[MetricKey.of(`finance.${channel}.${this.category}`), this.amount.toNumber()]])
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      amount: this.amount.toJSON(),
      category: this.category,
      direction: this.direction,
      ...(this.accountId !== undefined ? { accountId: this.accountId } : {}),
    }
  }

  static fromJSON(shape: unknown): Transaction {
    const base = parseEntryBase(shape, 'transaction')
    const { amount, category, direction, accountId, ...extra } = base.rest
    if (
      amount === undefined ||
      typeof category !== 'string' ||
      (direction !== 'expense' && direction !== 'income') ||
      (accountId !== undefined && typeof accountId !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a transaction shape')
    }
    let parsedAccountId: Id | undefined
    try {
      parsedAccountId = accountId !== undefined ? Id.of(accountId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', `transaction has a malformed accountId: "${accountId}"`)
    }
    const tx = new Transaction(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        amount: Money.fromJSON(amount),
        category,
        direction,
        ...(parsedAccountId !== undefined ? { accountId: parsedAccountId } : {}),
      },
      extra,
    )
    if (base.meta !== undefined) tx.meta = base.meta
    return tx
  }
}
