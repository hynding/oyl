import { DomainError } from './domain-error'
import { Id } from './id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from './persisted-meta'
import { assertSlug } from './slug'

export class LifeArea {
  readonly id: Id
  readonly name: string
  readonly slug: string
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; slug: string }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.slug = assertSlug(props.slug)
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      slug: this.slug,
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): LifeArea {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a LifeArea shape')
    }
    const { id, name, slug, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || typeof slug !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not a LifeArea shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `LifeArea has malformed id: "${id}"`)
    }
    const area = new LifeArea({ id: parsedId, name, slug }, extra)
    if (meta !== undefined) area.meta = metaFromJSON(meta)
    return area
  }
}
