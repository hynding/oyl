import { DayKey } from './day-key'
import { DomainError } from './domain-error'
import { Id } from './id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from './persisted-meta'

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

  /** For deserialization only: apply a parsePlanBase result's state + meta. */
  protected adoptBase(base: PlanBaseProps): void {
    this.restoreState(base.state)
    if (base.meta !== undefined) this.meta = base.meta
  }

  abstract toJSON(): Record<string, unknown>

  /**
   * For deserialization only: restore the mutable state machine verbatim.
   * Caller must pass a parsePlanBase-validated snapshot — no re-validation here.
   */
  protected restoreState(snapshot: PlanStateSnapshot): void {
    this.currentStatus = snapshot.status
    if (snapshot.completedOn !== undefined) this.completedOnDay = snapshot.completedOn
    else delete this.completedOnDay
    this.links.length = 0
    this.links.push(...snapshot.fulfilledBy)
  }
}

export type PlanStateSnapshot = {
  status: PlanStatus
  completedOn?: DayKey
  fulfilledBy: readonly Id[]
}

export type PlanBaseProps = {
  id: Id
  title: string
  due?: DayKey
  state: PlanStateSnapshot
  meta?: PersistedMeta
  /** Everything that wasn't a base field — subclass fields plus unknown extras. */
  rest: Record<string, unknown>
}

const PLAN_STATUSES: readonly PlanStatus[] = ['open', 'done', 'canceled']

/** Serialize the base fields shared by every plan kind. */
export function planBaseJSON(plan: Plan): Record<string, unknown> {
  return {
    id: plan.id,
    kind: plan.kind,
    title: plan.title,
    ...(plan.due !== undefined ? { due: plan.due.value } : {}),
    status: plan.status,
    ...(plan.completedOn !== undefined ? { completedOn: plan.completedOn.value } : {}),
    ...(plan.fulfilledBy.length > 0 ? { fulfilledBy: [...plan.fulfilledBy] } : {}),
    ...(plan.meta ? { meta: metaToJSON(plan.meta) } : {}),
  }
}

/** Parse and validate the base fields of a plan shape; subclass fields stay in `rest`. */
export function parsePlanBase(shape: unknown, expectedKind: string): PlanBaseProps {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', `not a ${expectedKind} shape`)
  }
  const { id, kind, title, due, status, completedOn, fulfilledBy, meta, ...rest } = shape as Record<string, unknown>
  if (
    kind !== expectedKind ||
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    title.length === 0 ||
    (due !== undefined && typeof due !== 'string') ||
    !(PLAN_STATUSES as readonly unknown[]).includes(status) ||
    (completedOn !== undefined && typeof completedOn !== 'string') ||
    (fulfilledBy !== undefined && !Array.isArray(fulfilledBy))
  ) {
    throw new DomainError('MALFORMED_JSON', `not a ${expectedKind} shape`)
  }
  // state-machine consistency: done iff completedOn present
  if ((status === 'done') !== (completedOn !== undefined)) {
    throw new DomainError('MALFORMED_JSON', `inconsistent plan state in ${expectedKind} shape`)
  }
  try {
    const parsedId = Id.of(id)
    const parsedDue = due !== undefined ? DayKey.of(due) : undefined
    const parsedCompletedOn = completedOn !== undefined ? DayKey.of(completedOn) : undefined
    const links = (fulfilledBy ?? []).map((raw: unknown) => {
      if (typeof raw !== 'string') throw new DomainError('MALFORMED_JSON', 'bad fulfilledBy entry')
      return Id.of(raw)
    })
    return {
      id: parsedId,
      title,
      ...(parsedDue !== undefined ? { due: parsedDue } : {}),
      state: {
        status: status as PlanStatus,
        ...(parsedCompletedOn !== undefined ? { completedOn: parsedCompletedOn } : {}),
        fulfilledBy: links,
      },
      ...(meta !== undefined ? { meta: metaFromJSON(meta) } : {}),
      rest,
    }
  } catch (e) {
    if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
      throw new DomainError('MALFORMED_JSON', `malformed ids or days in ${expectedKind} shape`)
    }
    throw e
  }
}
