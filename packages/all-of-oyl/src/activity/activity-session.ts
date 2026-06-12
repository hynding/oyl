import { DomainError } from '../core/domain-error'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { Quantity } from '../core/quantity'
import { assertSlug } from '../core/slug'

/**
 * Doing an activity — a run, a meditation, an hour of guitar. Snapshots the
 * activity's slug at log time (catalog edits never rewrite history). Doubles
 * as time tracking: minutes against an activity is "where my hours go".
 */
export class ActivitySession extends Entry {
  readonly activityId: Id
  readonly slug: string
  readonly quantities: readonly Quantity[]
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      occurredAt: Date
      note?: string
      /** A full Activity works; reviving passes the stored snapshot. */
      activity: { id: Id; slug: string }
      quantities?: readonly Quantity[]
    },
    extra: Record<string, unknown> = {},
  ) {
    const { activity, quantities = [], ...base } = props
    super('activity-session', base)
    this.activityId = activity.id
    this.slug = assertSlug(activity.slug)
    for (const q of quantities) assertSlug(q.unit) // units embed into metric keys
    this.quantities = [...quantities]
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    const m = new Map<MetricKey, number>()
    m.set(MetricKey.of(`activity.${this.slug}.count`), 1)
    for (const q of this.quantities) {
      const key = MetricKey.of(`activity.${this.slug}.${q.unit}`)
      m.set(key, (m.get(key) ?? 0) + q.amount)
    }
    return m
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      activityId: this.activityId,
      slug: this.slug,
      ...(this.quantities.length > 0 ? { quantities: this.quantities.map((q) => q.toJSON()) } : {}),
    }
  }

  static fromJSON(shape: unknown): ActivitySession {
    const base = parseEntryBase(shape, 'activity-session')
    const { activityId, slug, quantities, ...extra } = base.rest
    if (
      typeof activityId !== 'string' ||
      typeof slug !== 'string' ||
      (quantities !== undefined && !Array.isArray(quantities))
    ) {
      throw new DomainError('MALFORMED_JSON', 'not an activity-session shape')
    }
    let parsedActivityId: Id
    try {
      parsedActivityId = Id.of(activityId)
    } catch {
      throw new DomainError('MALFORMED_JSON', `activity-session has a malformed activityId: "${activityId}"`)
    }
    const session = new ActivitySession(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        activity: { id: parsedActivityId, slug },
        ...(quantities !== undefined ? { quantities: quantities.map((q) => Quantity.fromJSON(q)) } : {}),
      },
      extra,
    )
    if (base.meta !== undefined) session.meta = base.meta
    return session
  }
}
