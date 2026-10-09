import { GOAL_PERIODS, type AggregateKind, type GoalDirection, type GoalPeriod, type GoalProgress } from '@oyl/all-of-oyl'
import type { SelectOption } from '@oyl/ui-oyl'

export interface Preset {
  label: string
  metric: string
  direction: GoalDirection
  aggregation: AggregateKind
  period: GoalPeriod
}

/** Vanilla's five metric presets, in order; the select's value is the index. */
export const PRESETS: readonly Preset[] = [
  { label: 'Sleep (hours)', metric: 'sleep.hours', direction: 'atLeast', aggregation: 'sum', period: 'day' },
  { label: 'Weight (kg)', metric: 'body.weight_kg', direction: 'atMost', aggregation: 'last', period: 'day' },
  { label: 'Calories', metric: 'nutrition.calories', direction: 'atMost', aggregation: 'sum', period: 'day' },
  { label: 'Run minutes', metric: 'activity.run.minutes', direction: 'atLeast', aggregation: 'sum', period: 'week' },
  { label: 'Screen time (min)', metric: 'screen.minutes', direction: 'atMost', aggregation: 'sum', period: 'day' },
]
export const PRESET_OPTIONS: readonly SelectOption[] = PRESETS.map((p, i) => ({ value: String(i), label: p.label }))
export const PERIOD_OPTIONS: readonly SelectOption[] = GOAL_PERIODS.map((p) => ({ value: p, label: p }))

const UNITS: Record<string, string> = { 'sleep.hours': 'h', 'body.weight_kg': 'kg', 'nutrition.calories': 'kcal', 'activity.run.minutes': 'min', 'screen.minutes': 'min' }

/** Display unit for a goal metric ("" when unknown). */
export function metricUnit(metric: string): string {
  return UNITS[metric] ?? ''
}

/** Integer as-is, else one decimal. */
function compact(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Progress text honoring direction + state (paused/empty first): "12 / 20 h" or "1800 of 2200 kcal used". */
export function goalProgressLabel(p: GoalProgress, direction: GoalDirection, unit: string): string {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data this period'
  const u = unit ? ` ${unit}` : ''
  return direction === 'atMost' ? `${compact(p.current)} of ${compact(p.target)}${u} used` : `${compact(p.current)} / ${compact(p.target)}${u}`
}

/** "2 of 3 met today · 1 paused" ("" without goals; the paused part only when > 0). */
export function summaryLine(progress: readonly GoalProgress[]): string {
  if (progress.length === 0) return ''
  const met = progress.filter((p) => p.met === true).length
  const paused = progress.filter((p) => p.paused).length
  return `${met} of ${progress.length} met today${paused > 0 ? ` · ${paused} paused` : ''}`
}
