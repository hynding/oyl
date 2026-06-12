import type { DayKey } from '../core/day-key'
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
  return DayRange.of(day.startOfMonth(), day.endOfMonth())
}
