import type { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import type { Journal } from '../core/journal'
import { Money } from '../core/money'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'
import { assertSlug } from '../core/slug'
import { Goal, type GoalProgress } from './goal'
import { periodWindowOf } from './period'

/**
 * Per-category, per-month spending control — sugar over the goal engine
 * (atMost, month, emptyPeriods 'met': a month with no transactions really is
 * under budget). No second aggregation path: spent() flows through
 * journal.totalOf and progress through Goal.progressOn. Metric totals are
 * major-unit numbers; Money.fromMajor rounds them back to exact minor units.
 * Needs no finance types: a category slug and Money suffice (import rule).
 */
export class Budget {
  readonly id: Id
  readonly name?: string
  readonly category: string
  readonly limit: Money
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private readonly engine: Goal
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name?: string; category: string; limit: Money }, extra: Record<string, unknown> = {}) {
    if (props.name !== undefined && props.name.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'name must be non-empty when given')
    }
    if (props.limit.minor <= 0) {
      throw new DomainError('INVALID_QUANTITY', 'limit must be positive')
    }
    this.id = props.id ?? Id.create()
    if (props.name !== undefined) this.name = props.name
    this.category = assertSlug(props.category)
    this.limit = props.limit
    this.engine = new Goal({
      metric: `finance.spend.${this.category}`,
      target: this.limit.toNumber(),
      direction: 'atMost',
      period: 'month',
      emptyPeriods: 'met',
    })
    this.extra = extra
  }

  /** Net-of-refunds spending in the month containing `month`, as exact Money. */
  spent(journal: Journal, month: DayKey): Money {
    const total = journal.totalOf(this.engine.metric, periodWindowOf('month', month))
    return Money.fromMajor(total, this.limit.currency, this.limit.exponent)
  }

  remaining(journal: Journal, month: DayKey): Money {
    return this.limit.subtract(this.spent(journal, month))
  }

  progressOn(journal: Journal, day: DayKey): GoalProgress {
    return this.engine.progressOn(journal, day)
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      ...(this.name !== undefined ? { name: this.name } : {}),
      category: this.category,
      limit: this.limit.toJSON(),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Budget {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Budget shape')
    }
    const { id, name, category, limit, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || (name !== undefined && typeof name !== 'string') || typeof category !== 'string' || limit === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a Budget shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `Budget has a malformed id: "${id}"`)
    }
    const budget = new Budget(
      { id: parsedId, ...(name !== undefined ? { name: name as string } : {}), category, limit: Money.fromJSON(limit) },
      extra,
    )
    if (meta !== undefined) budget.meta = metaFromJSON(meta)
    return budget
  }
}
