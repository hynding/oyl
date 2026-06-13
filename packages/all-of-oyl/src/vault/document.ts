import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import type { Due } from '../core/due.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'

/** An important record — passport, insurance policy, warranty paper, will. */
export class Document implements Due {
  readonly id: Id
  readonly name: string
  /** What sort of document this is (passport/insurance/warranty/...), free-form. */
  readonly kind: string
  readonly expiresOn?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; kind: string; expiresOn?: DayKey }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    if (props.kind.length === 0) throw new DomainError('INVALID_QUANTITY', 'kind must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.kind = props.kind
    if (props.expiresOn !== undefined) this.expiresOn = props.expiresOn
    this.extra = extra
  }

  /** Fixed due: the expiry, regardless of asOf — an expired document still reports it. */
  nextDueOn(_asOf: DayKey): DayKey | undefined {
    return this.expiresOn
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      kind: this.kind,
      ...(this.expiresOn !== undefined ? { expiresOn: this.expiresOn.value } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Document {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Document shape')
    }
    const { id, name, kind, expiresOn, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || typeof kind !== 'string' || (expiresOn !== undefined && typeof expiresOn !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a Document shape')
    }
    try {
      const doc = new Document(
        { id: Id.of(id), name, kind, ...(expiresOn !== undefined ? { expiresOn: DayKey.of(expiresOn) } : {}) },
        extra,
      )
      if (meta !== undefined) doc.meta = metaFromJSON(meta)
      return doc
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Document shape')
      }
      throw e
    }
  }
}
