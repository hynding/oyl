import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import type { Id } from '../core/id.js'
import { Plan, parsePlanBase, planBaseJSON } from '../core/plan.js'

/**
 * A plan with a specific instant: the calendar/time-blocking primitive. The
 * due day is derived at construction from startsAt + an explicit IANA
 * timezone (no hidden clock/zone); revival reuses the persisted due day.
 */
export class Appointment extends Plan {
  readonly durationMinutes?: number
  private readonly startsAtMs: number
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      title: string
      startsAt: Date
      durationMinutes?: number
      /** Required unless a precomputed due day is supplied (revival path). */
      tz?: string
      due?: DayKey
    },
    extra: Record<string, unknown> = {},
  ) {
    const { startsAt, durationMinutes, tz, due, ...base } = props
    const derived = tz !== undefined ? DayKey.from(startsAt, tz) : undefined
    if (due !== undefined && derived !== undefined && !due.equals(derived)) {
      throw new DomainError('INVALID_DAY', `precomputed due ${due.value} contradicts ${derived.value} derived from tz`)
    }
    const resolvedDue = due ?? derived
    if (resolvedDue === undefined) {
      throw new DomainError('INVALID_TIMEZONE', 'an appointment needs an explicit tz (or a precomputed due day when reviving)')
    }
    super('appointment', { ...base, due: resolvedDue })
    if (durationMinutes !== undefined) {
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        throw new DomainError('INVALID_QUANTITY', `durationMinutes must be positive, got ${durationMinutes}`)
      }
      this.durationMinutes = durationMinutes
    }
    this.startsAtMs = startsAt.getTime()
    this.extra = extra
  }

  /** Always a fresh Date — appointments are calendar facts. */
  get startsAt(): Date {
    return new Date(this.startsAtMs)
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...planBaseJSON(this),
      startsAt: this.startsAt.toISOString(),
      ...(this.durationMinutes !== undefined ? { durationMinutes: this.durationMinutes } : {}),
    }
  }

  static fromJSON(shape: unknown): Appointment {
    const base = parsePlanBase(shape, 'appointment')
    const { startsAt, durationMinutes, ...extra } = base.rest
    if (typeof startsAt !== 'string' || (durationMinutes !== undefined && typeof durationMinutes !== 'number')) {
      throw new DomainError('MALFORMED_JSON', 'not an appointment shape')
    }
    const at = new Date(startsAt)
    if (Number.isNaN(at.getTime()) || base.due === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not an appointment shape')
    }
    const appt = new Appointment(
      {
        id: base.id,
        title: base.title,
        startsAt: at,
        due: base.due,
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      },
      extra,
    )
    appt.adoptBase(base)
    return appt
  }
}
