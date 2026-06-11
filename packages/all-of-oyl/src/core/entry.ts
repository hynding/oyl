import { Id } from './id'
import type { MetricKey } from './metric-key'
import type { PersistedMeta } from './persisted-meta'

/**
 * A timestamped record of something you did. One of two abstract classes in
 * the system (the other is Plan). Subclasses fix `kind` (the serialization
 * discriminant) and implement `metrics()` — what this moment contributed to
 * your life, in numbers.
 */
export abstract class Entry {
  readonly id: Id
  readonly kind: string
  readonly note?: string
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private readonly occurredAtMs: number

  protected constructor(kind: string, props: { id?: Id; occurredAt: Date; note?: string }) {
    this.kind = kind
    this.id = props.id ?? Id.create()
    this.occurredAtMs = props.occurredAt.getTime()
    if (props.note !== undefined) this.note = props.note
  }

  /** Always a fresh Date — entries are deeply immutable. */
  get occurredAt(): Date {
    return new Date(this.occurredAtMs)
  }

  abstract metrics(): ReadonlyMap<MetricKey, number>
}
