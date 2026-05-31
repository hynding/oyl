// packages/react-oyl/modules/user/daily-new/orchestrator-utils.ts
import type { TDataId, TUserActivityData, TUserGoalData } from '@oyl/all-of-oyl/modules'
import { matchesDate } from '@oyl/all-of-oyl/modules/user/activity/schedule'

/** Returns the numeric id from either a full data record or a bare TDataId. */
function extractId(item: { id?: TDataId } | TDataId): TDataId | undefined {
  if (typeof item === 'number') return item
  return (item as { id?: TDataId }).id
}

/**
 * Returns activities that are active AND match the given date (via schedule)
 * OR whose id appears in the daily pin list.
 */
export function filterActivitiesForDate(
  allActivities: TUserActivityData[],
  dailyPins: Array<TUserActivityData | TDataId>,
  date: string,
): TUserActivityData[] {
  const pinIds = new Set(dailyPins.map(extractId).filter((id): id is TDataId => id !== undefined))

  return allActivities.filter(a => {
    if (a.id !== undefined && pinIds.has(a.id)) return true
    return a.current_status === 'active' && matchesDate(a.schedule, date)
  })
}

/**
 * Returns goals that are active (and whose target_date, if set, has not passed)
 * OR whose id appears in the daily pin list.
 */
export function filterGoalsForDate(
  allGoals: TUserGoalData[],
  dailyPins: Array<TUserGoalData | TDataId>,
  date: string,
): TUserGoalData[] {
  const pinIds = new Set(dailyPins.map(extractId).filter((id): id is TDataId => id !== undefined))

  return allGoals.filter(g => {
    if (g.id !== undefined && pinIds.has(g.id)) return true
    if (g.current_status !== 'active') return false
    // If a target_date is set, only include the goal while the date hasn't passed it
    if (g.target_date && g.target_date < date) return false
    return true
  })
}
