import { DomainError } from '../core/domain-error.js'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry.js'
import type { Id } from '../core/id.js'
import { MetricKey } from '../core/metric-key.js'
import { assertSlug } from '../core/slug.js'

/**
 * Free-text journaling and gratitude. Emits note.count (and a per-tag count)
 * so streaks like "journal daily" work. The inherited `note` field stays the
 * short annotation every entry has; `text` is the content.
 */
export class Note extends Entry {
  readonly text: string
  readonly tags: readonly string[]
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; occurredAt: Date; note?: string; text: string; tags?: readonly string[] },
    extra: Record<string, unknown> = {},
  ) {
    const { text, tags = [], ...base } = props
    super('note', base)
    if (text.length === 0) throw new DomainError('INVALID_QUANTITY', 'text must be non-empty')
    for (const tag of tags) assertSlug(tag)
    this.text = text
    this.tags = [...new Set(tags)]
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    const m = new Map<MetricKey, number>()
    m.set(MetricKey.of('note.count'), 1)
    for (const tag of this.tags) {
      m.set(MetricKey.of(`note.${tag}.count`), 1)
    }
    return m
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      text: this.text,
      ...(this.tags.length > 0 ? { tags: [...this.tags] } : {}),
    }
  }

  static fromJSON(shape: unknown): Note {
    const base = parseEntryBase(shape, 'note')
    const { text, tags, ...extra } = base.rest
    if (typeof text !== 'string' || (tags !== undefined && (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')))) {
      throw new DomainError('MALFORMED_JSON', 'not a note shape')
    }
    const entry = new Note(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        text,
        ...(tags !== undefined ? { tags: tags as string[] } : {}),
      },
      extra,
    )
    if (base.meta !== undefined) entry.meta = base.meta
    return entry
  }
}
