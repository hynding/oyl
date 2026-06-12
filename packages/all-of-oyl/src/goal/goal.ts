import { DayKey } from '../core/day-key'
import type { DayRange } from '../core/day-range'
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

  /** A window is paused when it overlaps any paused range. Implemented in Task 3. */
  protected isPausedDuring(_window: DayRange): boolean {
    return false
  }
}
