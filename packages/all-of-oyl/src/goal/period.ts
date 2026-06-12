import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'

export type GoalPeriod = 'day' | 'week' | 'month'

export const GOAL_PERIODS: readonly GoalPeriod[] = ['day', 'week', 'month']

/**
 * The deterministic window containing `day`: the day itself, its ISO week
 * (Monday–Sunday), or its calendar month. All derived from DayKey, so the
 * Journal's timezone decision flows through unchanged.
 */
export function periodWindowOf(period: GoalPeriod, day: DayKey): DayRange {
  if (period === 'day') return DayRange.of(day, day)
  if (period === 'week') {
    const monday = day.addDays(1 - day.weekday())
    return DayRange.of(monday, monday.addDays(6))
  }
  const [y, m] = day.value.split('-').map(Number) as [number, number]
  const first = DayKey.of(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`)
  const nextFirst =
    m === 12
      ? DayKey.of(`${String(y + 1).padStart(4, '0')}-01-01`)
      : DayKey.of(`${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-01`)
  return DayRange.of(first, nextFirst.addDays(-1))
}
