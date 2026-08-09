// packages/all-of-oyl/src/insights/daily-series.ts
import type { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import type { Journal } from '../core/journal.js'
import { MetricKey } from '../core/metric-key.js'

/**
 * Per-day numeric buckets for sparklines: one value per day of `range`, in
 * order. The selector receives (journal, day); pair with the day-selectors
 * below. Journal owns tz bucketing — that's why this takes a Journal, not a
 * raw entry list (deliberate revision of the spec's earlier sketch).
 */
export function dailySeries(
  journal: Journal,
  range: DayRange,
  valueOn: (journal: Journal, day: DayKey) => number,
): readonly number[] {
  const out: number[] = []
  for (const day of range) out.push(valueOn(journal, day))
  return out
}

const dayRange = (day: DayKey) => DayRange.of(day, day)

/** Total spend recorded on `day` (all finance.spend.* categories). */
export function spendingOn(journal: Journal, day: DayKey): number {
  let total = 0
  for (const value of journal.totalsByPrefix('finance.spend', dayRange(day)).values()) total += value
  return total
}

/** Calories recorded on `day`. */
export function caloriesOn(journal: Journal, day: DayKey): number {
  return journal.totalOf(MetricKey.of('nutrition.calories'), dayRange(day))
}

/** Active minutes recorded on `day` (activity.*.minutes only — counts excluded). */
export function activeMinutesOn(journal: Journal, day: DayKey): number {
  let total = 0
  for (const [key, value] of journal.totalsByPrefix('activity', dayRange(day))) {
    if (key.endsWith('.minutes')) total += value
  }
  return total
}
