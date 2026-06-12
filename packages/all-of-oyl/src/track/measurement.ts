import { DomainError } from '../core/domain-error'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry'
import type { Id } from '../core/id'
import { MEASUREMENT_NAMESPACES, MetricKey } from '../core/metric-key'

/**
 * One generic class for any numeric observation — weight, blood pressure,
 * sleep hours, mood, screen time, kWh. Conventional keys: body.weight_kg,
 * body.bp_systolic, sleep.hours, mood.score, screen.minutes, home.kwh; user
 * metrics live under custom.*. Hand-logged values must not pollute derived
 * metrics, so entry-owned namespaces (activity, nutrition, finance, note)
 * are rejected with RESERVED_NAMESPACE.
 */
export class Measurement extends Entry {
  readonly metric: MetricKey
  readonly value: number
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; occurredAt: Date; note?: string; metric: string; value: number },
    extra: Record<string, unknown> = {},
  ) {
    const { metric, value, ...base } = props
    super('measurement', base)
    const key = MetricKey.of(metric)
    const namespace = MetricKey.namespaceOf(key)
    if (!(MEASUREMENT_NAMESPACES as readonly string[]).includes(namespace)) {
      throw new DomainError(
        'RESERVED_NAMESPACE',
        `measurements may not write into "${namespace}.*" (allowed: ${MEASUREMENT_NAMESPACES.join(', ')})`,
      )
    }
    if (!Number.isFinite(value)) {
      throw new DomainError('INVALID_QUANTITY', `value must be finite, got ${value}`)
    }
    this.metric = key
    this.value = value
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    return new Map([[this.metric, this.value]])
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      metric: this.metric,
      value: this.value,
    }
  }

  static fromJSON(shape: unknown): Measurement {
    const base = parseEntryBase(shape, 'measurement')
    const { metric, value, ...extra } = base.rest
    if (typeof metric !== 'string' || typeof value !== 'number') {
      throw new DomainError('MALFORMED_JSON', 'not a measurement shape')
    }
    const m = new Measurement(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        metric,
        value,
      },
      extra,
    )
    if (base.meta !== undefined) m.meta = base.meta
    return m
  }
}
