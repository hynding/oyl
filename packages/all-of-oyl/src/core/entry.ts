import { DomainError } from './domain-error'
import { Id } from './id'
import type { MetricKey } from './metric-key'
import { type PersistedMeta, metaFromJSON, metaToJSON } from './persisted-meta'

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

export type EntryBaseProps = {
  id: Id
  occurredAt: Date
  note?: string
  meta?: PersistedMeta
  /** Everything that wasn't a base field — subclass fields plus unknown extras. */
  rest: Record<string, unknown>
}

/** Serialize the base fields shared by every entry kind. */
export function entryBaseJSON(entry: Entry): Record<string, unknown> {
  return {
    id: entry.id,
    kind: entry.kind,
    occurredAt: entry.occurredAt.toISOString(),
    ...(entry.note !== undefined ? { note: entry.note } : {}),
    ...(entry.meta ? { meta: metaToJSON(entry.meta) } : {}),
  }
}

/** Parse and validate the base fields of an entry shape; subclass fields stay in `rest`. */
export function parseEntryBase(shape: unknown, expectedKind: string): EntryBaseProps {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', `not a ${expectedKind} shape`)
  }
  const { id, kind, occurredAt, note, meta, ...rest } = shape as Record<string, unknown>
  if (
    kind !== expectedKind ||
    typeof id !== 'string' ||
    typeof occurredAt !== 'string' ||
    (note !== undefined && typeof note !== 'string')
  ) {
    throw new DomainError('MALFORMED_JSON', `not a ${expectedKind} shape`)
  }
  const at = new Date(occurredAt)
  if (Number.isNaN(at.getTime())) {
    throw new DomainError('MALFORMED_JSON', `bad occurredAt in ${expectedKind} shape`)
  }
  let parsedId: Id
  try {
    parsedId = Id.of(id)
  } catch {
    throw new DomainError('MALFORMED_JSON', `malformed id in ${expectedKind} shape: "${id}"`)
  }
  return {
    id: parsedId,
    occurredAt: at,
    ...(note !== undefined ? { note } : {}),
    ...(meta !== undefined ? { meta: metaFromJSON(meta) } : {}),
    rest,
  }
}
