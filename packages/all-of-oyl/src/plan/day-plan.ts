import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'

/** "HH:MM", 00:00–23:59, local to the plan's day — a time box belongs to the day, not to an instant. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export type DayPlanSlot = { planId: Id; start?: string; end?: string }

/**
 * The day-by-day planning primitive: at most one per day, an ordered list of
 * slots referencing plans, optionally time-boxed. The user's edited version
 * of the derived agenda. Slots referencing canceled or missing plans are
 * skipped by reading queries (kept in storage — the plan may be restored).
 */
export class DayPlan {
  readonly id: Id
  readonly day: DayKey
  readonly slots: readonly DayPlanSlot[]
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; day: DayKey; slots: readonly DayPlanSlot[] }, extra: Record<string, unknown> = {}) {
    for (const slot of props.slots) {
      if (slot.start !== undefined && !TIME_RE.test(slot.start)) {
        throw new DomainError('INVALID_QUANTITY', `not a valid HH:MM time: "${slot.start}"`)
      }
      if (slot.end !== undefined) {
        if (slot.start === undefined) {
          throw new DomainError('INVALID_RANGE', 'a slot end requires a start')
        }
        if (!TIME_RE.test(slot.end)) {
          throw new DomainError('INVALID_QUANTITY', `not a valid HH:MM time: "${slot.end}"`)
        }
        // lexicographic comparison is chronologic ONLY because TIME_RE forces zero-padded HH:MM — keep them in sync
        if (slot.end <= slot.start) {
          throw new DomainError('INVALID_RANGE', `slot end ${slot.end} must follow start ${slot.start}`)
        }
      }
    }
    this.id = props.id ?? Id.create()
    this.day = props.day
    this.slots = props.slots.map((s) => ({ ...s }))
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      day: this.day.value,
      slots: this.slots.map((s) => ({
        planId: s.planId,
        ...(s.start !== undefined ? { start: s.start } : {}),
        ...(s.end !== undefined ? { end: s.end } : {}),
      })),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): DayPlan {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a DayPlan shape')
    }
    const { id, day, slots, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof day !== 'string' || !Array.isArray(slots)) {
      throw new DomainError('MALFORMED_JSON', 'not a DayPlan shape')
    }
    try {
      const parsedSlots: DayPlanSlot[] = slots.map((raw: unknown) => {
        const s = raw as { planId?: unknown; start?: unknown; end?: unknown }
        if (typeof s?.planId !== 'string' || (s.start !== undefined && typeof s.start !== 'string') || (s.end !== undefined && typeof s.end !== 'string')) {
          throw new DomainError('MALFORMED_JSON', 'bad DayPlan slot')
        }
        return {
          planId: Id.of(s.planId),
          ...(s.start !== undefined ? { start: s.start } : {}),
          ...(s.end !== undefined ? { end: s.end } : {}),
        }
      })
      const plan = new DayPlan({ id: Id.of(id), day: DayKey.of(day), slots: parsedSlots }, extra)
      if (meta !== undefined) plan.meta = metaFromJSON(meta)
      return plan
    } catch (e) {
      if (e instanceof DomainError) throw new DomainError('MALFORMED_JSON', 'not a DayPlan shape')
      throw e
    }
  }
}
