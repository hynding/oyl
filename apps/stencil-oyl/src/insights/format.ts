import { Money, type AreaRollup, type GoalProgress, type Review } from '@oyl/all-of-oyl'
import { formatMoney } from '@oyl/all-of-oyl/format'
import type { SelectOption } from '@oyl/ui-oyl'

/** The two review windows the segment offers (a subtype of `GoalPeriod` — no `day`). */
export type InsightsPeriod = 'week' | 'month'
export const INSIGHTS_PERIODS: readonly SelectOption[] = [{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]

export type TileKey = 'spending' | 'activity' | 'calories' | 'completion'
export const TILES: readonly { key: TileKey; caption: string }[] = [
  { key: 'spending', caption: 'Spent' }, { key: 'activity', caption: 'Active min' }, { key: 'calories', caption: 'Calories' }, { key: 'completion', caption: 'Plans done' },
]

/** A major-unit number as USD (insights spending is single-currency, as in vanilla). */
export function usd(n: number): string {
  return formatMoney(Money.fromMajor(n, 'USD'))
}

/** A goal's review label from its progress alone (GoalReview lacks direction/unit). */
export function reviewGoalLabel(p: GoalProgress): string {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data'
  if (p.met === true) return 'Met'
  return `${Math.round(p.ratio * 100)}%`
}

/** "2/3 goals · 120 min · 1 project" from the present parts; "Nothing tracked" when all empty. */
export function areaStatsLabel(a: AreaRollup): string {
  const parts: string[] = []
  if (a.goalsTotal > 0) parts.push(`${a.goalsMet}/${a.goalsTotal} goals`)
  if (a.activityMinutes > 0) parts.push(`${Math.round(a.activityMinutes)} min`)
  if (a.projectsTouched > 0) parts.push(`${a.projectsTouched} project${a.projectsTouched === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'Nothing tracked'
}

/** "120 min · 3×" from the present parts. */
export function activityLabel(a: Review['activityTotals'][number]): string {
  const parts: string[] = []
  if (a.minutes) parts.push(`${Math.round(a.minutes)} min`)
  if (a.count) parts.push(`${a.count}×`)
  return parts.join(' · ')
}

/** "↑ $42.50" / "↓ 20"; "" when the displayed magnitude would be zero. */
export function deltaLabel(delta: number, money: boolean): string {
  const mag = Math.abs(delta)
  const text = money ? usd(mag) : String(Math.round(mag))
  if (money ? Math.round(mag * 100) === 0 : Math.round(mag) === 0) return ''
  return `${delta > 0 ? '↑' : '↓'} ${text}`
}

/** "—" when the planner had no open/done plans due in the period, else a rounded percent. */
export function completionLabel(rate: number | undefined): string {
  return rate === undefined ? '—' : `${Math.round(rate * 100)}%`
}
