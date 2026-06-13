import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'
import { assertSlug } from '../core/slug.js'

/** A reusable definition of something you do ("Run", "Meditate"). */
export class Activity {
  readonly id: Id
  readonly name: string
  readonly slug: string
  readonly defaultUnit?: string
  readonly areaId?: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; name: string; slug: string; defaultUnit?: string; areaId?: Id },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.slug = assertSlug(props.slug)
    if (props.defaultUnit !== undefined) this.defaultUnit = assertSlug(props.defaultUnit)
    if (props.areaId !== undefined) this.areaId = props.areaId
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      slug: this.slug,
      ...(this.defaultUnit !== undefined ? { defaultUnit: this.defaultUnit } : {}),
      ...(this.areaId !== undefined ? { areaId: this.areaId } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Activity {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not an Activity shape')
    }
    const { id, name, slug, defaultUnit, areaId, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      typeof slug !== 'string' ||
      (defaultUnit !== undefined && typeof defaultUnit !== 'string') ||
      (areaId !== undefined && typeof areaId !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not an Activity shape')
    }
    let parsedId: Id
    let parsedAreaId: Id | undefined
    try {
      parsedId = Id.of(id)
      parsedAreaId = areaId !== undefined ? Id.of(areaId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', 'Activity has a malformed id')
    }
    const activity = new Activity(
      {
        id: parsedId,
        name,
        slug,
        ...(defaultUnit !== undefined ? { defaultUnit } : {}),
        ...(parsedAreaId !== undefined ? { areaId: parsedAreaId } : {}),
      },
      extra,
    )
    if (meta !== undefined) activity.meta = metaFromJSON(meta)
    return activity
  }
}
