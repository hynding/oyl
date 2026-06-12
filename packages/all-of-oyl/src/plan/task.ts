import { Cadence } from '../core/cadence'
import type { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { Plan, parsePlanBase, planBaseJSON } from '../core/plan'

/**
 * The plain to-do. Recurring tasks deliberately cover ALL recurring duties —
 * chores, asset upkeep, watering plants: there is exactly one recurrence-of-
 * duty mechanism in the system, and it re-anchors on actual completion (the
 * plants care when they were last watered, not what the calendar says).
 * `possessionId` is a bare Id — no vault import.
 */
export class Task extends Plan {
  readonly projectId?: Id
  readonly cadence?: Cadence
  readonly possessionId?: Id
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; title: string; due?: DayKey; projectId?: Id; cadence?: Cadence; possessionId?: Id },
    extra: Record<string, unknown> = {},
  ) {
    const { projectId, cadence, possessionId, ...base } = props
    super('task', base)
    if (projectId !== undefined) this.projectId = projectId
    if (cadence !== undefined) this.cadence = cadence
    if (possessionId !== undefined) this.possessionId = possessionId
    this.extra = extra
  }

  /** The successor of a completed recurring task, due `cadence.nextAfter(completedOn)`. */
  spawnNext(): Task {
    if (this.cadence === undefined || this.status !== 'done' || this.completedOn === undefined) {
      throw new DomainError('ILLEGAL_TRANSITION', 'only a completed recurring task spawns a successor')
    }
    return new Task({
      title: this.title,
      due: this.cadence.nextAfter(this.completedOn),
      cadence: this.cadence,
      ...(this.projectId !== undefined ? { projectId: this.projectId } : {}),
      ...(this.possessionId !== undefined ? { possessionId: this.possessionId } : {}),
    })
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...planBaseJSON(this),
      ...(this.projectId !== undefined ? { projectId: this.projectId } : {}),
      ...(this.cadence !== undefined ? { cadence: this.cadence.toJSON() } : {}),
      ...(this.possessionId !== undefined ? { possessionId: this.possessionId } : {}),
    }
  }

  static fromJSON(shape: unknown): Task {
    const base = parsePlanBase(shape, 'task')
    const { projectId, cadence, possessionId, ...extra } = base.rest
    if ((projectId !== undefined && typeof projectId !== 'string') || (possessionId !== undefined && typeof possessionId !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a task shape')
    }
    let parsedProjectId: Id | undefined
    let parsedPossessionId: Id | undefined
    let parsedCadence: Cadence | undefined
    try {
      parsedProjectId = projectId !== undefined ? Id.of(projectId) : undefined
      parsedPossessionId = possessionId !== undefined ? Id.of(possessionId) : undefined
      parsedCadence = cadence !== undefined ? Cadence.fromJSON(cadence) : undefined
    } catch (e) {
      if (e instanceof DomainError) throw new DomainError('MALFORMED_JSON', 'not a task shape')
      throw e
    }
    const task = new Task(
      {
        id: base.id,
        title: base.title,
        ...(base.due !== undefined ? { due: base.due } : {}),
        ...(parsedProjectId !== undefined ? { projectId: parsedProjectId } : {}),
        ...(parsedCadence !== undefined ? { cadence: parsedCadence } : {}),
        ...(parsedPossessionId !== undefined ? { possessionId: parsedPossessionId } : {}),
      },
      extra,
    )
    task.adoptBase(base)
    return task
  }
}
