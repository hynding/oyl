import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'
import { Task } from './task'
import type { Planner } from './planner'

/** A named group of tasks. Tasks point at it via projectId. */
export class Project {
  readonly id: Id
  readonly name: string
  readonly areaId?: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; areaId?: Id }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    if (props.areaId !== undefined) this.areaId = props.areaId
    this.extra = extra
  }

  /** done ÷ (done + open) among this project's tasks; canceled excluded; undefined when it has none. */
  progress(planner: Planner): number | undefined {
    const tasks = planner.all().filter((p): p is Task => p instanceof Task && p.projectId === this.id)
    const done = tasks.filter((t) => t.status === 'done').length
    const open = tasks.filter((t) => t.status === 'open').length
    const total = done + open
    return total === 0 ? undefined : done / total
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      ...(this.areaId !== undefined ? { areaId: this.areaId } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Project {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Project shape')
    }
    const { id, name, areaId, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || (areaId !== undefined && typeof areaId !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a Project shape')
    }
    let parsedId: Id
    let parsedAreaId: Id | undefined
    try {
      parsedId = Id.of(id)
      parsedAreaId = areaId !== undefined ? Id.of(areaId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', 'Project has a malformed id')
    }
    const project = new Project({ id: parsedId, name, ...(parsedAreaId !== undefined ? { areaId: parsedAreaId } : {}) }, extra)
    if (meta !== undefined) project.meta = metaFromJSON(meta)
    return project
  }
}
