import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import type { AggregateKind, Journal } from '../core/journal'
import { MetricKey } from '../core/metric-key'
import type { PersistedMeta } from '../core/persisted-meta'
import { type GoalPeriod, periodWindowOf } from './period'

export type GoalDirection = 'atLeast' | 'atMost'
export type EmptyPeriods = 'met' | 'skip'

/**
 * One period's verdict. `met` is undefined for two distinguishable reasons —
 * `paused: true` (you said stop judging) or `empty: true` with the default
 * 'skip' policy (there was nothing to judge) — both flags are explicit so
 * UIs can render them differently.
 */
export type GoalProgress = {
  current: number
  target: number
  /** Clamped to [0, 1]: attainment for atLeast, allowance consumed for atMost. */
  ratio: number
  met?: boolean
  paused: boolean
  empty: boolean
}

type PauseRange = { from: DayKey; to?: DayKey }

/**
 * Domain-blind: a Goal targets a metric key and never knows which domain
 * produced the number. Progress flows through journal.aggregate — the single
 * aggregation path. Stateful entity: pause ranges mutate in place.
 */
export class Goal {
  readonly id: Id
  readonly name?: string
  readonly metric: MetricKey
  readonly target: number
  readonly direction: GoalDirection
  readonly period: GoalPeriod
  readonly aggregation: AggregateKind
  readonly emptyPeriods: EmptyPeriods
  readonly areaId?: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private pauseRanges: PauseRange[] = []
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      name?: string
      metric: string
      target: number
      direction: GoalDirection
      period: GoalPeriod
      aggregation?: AggregateKind
      emptyPeriods?: EmptyPeriods
      areaId?: Id
    },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name !== undefined && props.name.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'name must be non-empty when given')
    }
    if (!Number.isFinite(props.target) || props.target <= 0) {
      throw new DomainError('INVALID_QUANTITY', `target must be a positive finite number, got ${props.target}`)
    }
    this.id = props.id ?? Id.create()
    if (props.name !== undefined) this.name = props.name
    this.metric = MetricKey.of(props.metric)
    this.target = props.target
    this.direction = props.direction
    this.period = props.period
    this.aggregation = props.aggregation ?? 'sum'
    this.emptyPeriods = props.emptyPeriods ?? 'skip'
    if (props.areaId !== undefined) this.areaId = props.areaId
    this.extra = extra
  }

  /** The period window containing `day`, judged by this goal's rules. */
  progressOn(journal: Journal, day: DayKey): GoalProgress {
    const window = periodWindowOf(this.period, day)
    const raw = journal.aggregate(this.metric, window, this.aggregation)
    const empty = raw === undefined
    const current = raw ?? 0
    const ratio = Math.min(Math.max(current / this.target, 0), 1)
    const paused = this.isPausedDuring(window)
    const base: GoalProgress = { current, target: this.target, ratio, paused, empty }
    if (paused) return base
    if (empty) return this.emptyPeriods === 'met' ? { ...base, met: true } : base
    const met = this.direction === 'atLeast' ? current >= this.target : current <= this.target
    return { ...base, met }
  }

  /** Defensive copies; canonical (sorted, merged) order. */
  get pauses(): readonly { from: DayKey; to?: DayKey }[] {
    return this.pauseRanges.map((r) => ({ ...r }))
  }

  /**
   * Pause judgment from `from`, optionally through `to` (inclusive). Omitting
   * `to` is vacation mode — paused until resume(). Overlapping or adjacent
   * ranges merge so pause history stays canonical.
   */
  pause(from: DayKey, to?: DayKey): void {
    if (to !== undefined && to.compare(from) < 0) {
      throw new DomainError('INVALID_RANGE', `pause end ${to.value} precedes start ${from.value}`)
    }
    this.pauseRanges.push(to !== undefined ? { from, to } : { from })
    this.canonicalize()
  }

  /** Close the open pause (inclusive end). Throws if nothing is open. */
  resume(on: DayKey): void {
    const open = this.pauseRanges.find((r) => r.to === undefined)
    if (open === undefined) {
      throw new DomainError('ILLEGAL_TRANSITION', 'no open pause to resume')
    }
    if (on.compare(open.from) < 0) {
      throw new DomainError('INVALID_RANGE', `resume ${on.value} precedes pause start ${open.from.value}`)
    }
    open.to = on
    this.canonicalize()
  }

  private isPausedDuring(window: DayRange): boolean {
    return this.pauseRanges.some(
      (r) => r.from.compare(window.end) <= 0 && (r.to === undefined || r.to.compare(window.start) >= 0),
    )
  }

  /** Sort by start; merge overlapping/adjacent; an open range swallows everything after it. */
  private canonicalize(): void {
    const sorted = [...this.pauseRanges].sort((a, b) => a.from.compare(b.from))
    const merged: PauseRange[] = []
    for (const range of sorted) {
      const prev = merged[merged.length - 1]
      if (prev === undefined) {
        merged.push({ ...range })
        continue
      }
      if (prev.to === undefined) continue // open swallows the rest
      if (range.from.compare(prev.to.addDays(1)) <= 0) {
        if (range.to === undefined) {
          delete prev.to
        } else if (range.to.compare(prev.to) > 0) {
          prev.to = range.to
        }
      } else {
        merged.push({ ...range })
      }
    }
    this.pauseRanges = merged
  }
}
