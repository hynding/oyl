import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** A gift thought, tied to a contact; surfaces alongside their next occasion. */
export class GiftIdea {
  readonly id: Id
  readonly text: string
  readonly contactId: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; text: string; contactId: Id }, extra: Record<string, unknown> = {}) {
    if (props.text.length === 0) throw new DomainError('INVALID_QUANTITY', 'text must be non-empty')
    this.id = props.id ?? Id.create()
    this.text = props.text
    this.contactId = props.contactId
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      text: this.text,
      contactId: this.contactId,
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): GiftIdea {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a GiftIdea shape')
    }
    const { id, text, contactId, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof text !== 'string' || typeof contactId !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not a GiftIdea shape')
    }
    try {
      const idea = new GiftIdea({ id: Id.of(id), text, contactId: Id.of(contactId) }, extra)
      if (meta !== undefined) idea.meta = metaFromJSON(meta)
      return idea
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a GiftIdea shape')
      }
      throw e
    }
  }
}
