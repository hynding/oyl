// packages/react-oyl/modules/user/daily/orchestrator-utils.ts
import type { TDataId, TUserActivityData, TUserGoalData, TUserNutritionData } from '@oyl/all-of-oyl/modules'
import { matchesDate } from '@oyl/all-of-oyl/modules'
import type { DailyTotals, NutritionRow } from '@/modules/user/nutrition/types'

export type { DailyTotals, NutritionRow }

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

function localDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const y = parts.find(p => p.type === 'year')?.value ?? ''
  const m = parts.find(p => p.type === 'month')?.value ?? ''
  const d = parts.find(p => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${d}`
}

export function filterNutritionsForDate(logs: TUserNutritionData[], date: string, timezone: string): TUserNutritionData[] {
  return logs
    .filter(l => !l.deleted_at && localDate(l.date, timezone) === date)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function macroFromRow(row: NutritionRow, key: 'calories' | 'protein' | 'carbs' | 'fat'): number {
  const { log, item } = row
  const perKey = `${key}_per_100` as const
  if (item && item.serving_size != null && item[perKey] != null) {
    return Number(log.servings) * Number(item[perKey]) * Number(item.serving_size) / 100
  }
  return Number(log[key] ?? 0)
}

export function computeDailyTotals(rows: NutritionRow[], targets: DailyTotals['targets']): DailyTotals {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  for (const row of rows) {
    totals.calories += macroFromRow(row, 'calories')
    totals.protein += macroFromRow(row, 'protein')
    totals.carbs += macroFromRow(row, 'carbs')
    totals.fat += macroFromRow(row, 'fat')
  }
  const progress: DailyTotals['progress'] = {}
  for (const k of ['calories', 'protein', 'carbs', 'fat'] as const) {
    const t = targets[k]
    if (typeof t === 'number' && t > 0) progress[k] = totals[k] / t
  }
  return { ...totals, targets, progress }
}
