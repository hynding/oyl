import type { DayKey } from './day-key'
import { DomainError } from './domain-error'
import { Id } from './id'
import type { PersistedMeta } from './persisted-meta'

export type PlanStatus = 'open' | 'done' | 'canceled'

/**
 * An intention — something supposed to happen. One of two abstract classes
 * in the system (the other is Entry). Stateful: status mutates in place.
 */
export abstract class Plan {
  readonly id: Id
  readonly kind: string
  readonly title: string
  readonly due?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private currentStatus: PlanStatus = 'open'
  private completedOnDay?: DayKey
  private readonly links: Id[] = []

  protected constructor(kind: string, props: { id?: Id; title: string; due?: DayKey }) {
    if (props.title.length === 0) throw new DomainError('INVALID_QUANTITY', 'title must be non-empty')
    this.kind = kind
    this.id = props.id ?? Id.create()
    this.title = props.title
    if (props.due !== undefined) this.due = props.due
  }

  get status(): PlanStatus {
    return this.currentStatus
  }

  get completedOn(): DayKey | undefined {
    return this.completedOnDay
  }

  get fulfilledBy(): readonly Id[] {
    return [...this.links]
  }

  private assertOpen(op: string): void {
    if (this.currentStatus !== 'open') {
      throw new DomainError('ILLEGAL_TRANSITION', `cannot ${op} a ${this.currentStatus} plan`)
    }
  }

  /** Done-on-time and recurring respawn both need `on` — when you actually did it. */
  complete(on: DayKey, entryId?: Id): void {
    this.assertOpen('complete')
    this.currentStatus = 'done'
    this.completedOnDay = on
    if (entryId !== undefined) this.links.push(entryId)
  }

  cancel(): void {
    this.assertOpen('cancel')
    this.currentStatus = 'canceled'
  }
}
