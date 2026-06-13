// packages/all-of-oyl/src/insights/review.ts
import type { Activity } from '../activity/activity.js'
import { DayRange } from '../core/day-range.js'
import type { Id } from '../core/id.js'
import type { Journal } from '../core/journal.js'
import type { LifeArea } from '../core/life-area.js'
import { MetricKey } from '../core/metric-key.js'
import type { Goal, GoalProgress } from '../goal/goal.js'
import type { Planner } from '../plan/planner.js'
import type { Project } from '../plan/project.js'
import { Task } from '../plan/task.js'
import { streak } from './streak.js'

export type ReviewTotals = { spending: number; activityMinutes: number; calories: number }
export type GoalReview = { goalId: Id; name?: string; progress: GoalProgress; streak: number }
export type AreaRollup = {
  areaId?: Id
  name: string
  goalsMet: number
  goalsTotal: number
  activityMinutes: number
  projectsTouched: number
}

/** Plain data an app can render — the weekly/monthly/annual review. */
export type Review = {
  period: DayRange
  goals: readonly GoalReview[]
  topSpending: readonly { category: string; total: number }[]
  activityTotals: readonly { slug: string; count: number; minutes: number }[]
  completionRate?: number
  totals: ReviewTotals
  previousTotals: ReviewTotals
  deltas: ReviewTotals
  areas: readonly AreaRollup[]
}

function totalsFor(journal: Journal, range: DayRange): ReviewTotals {
  let spending = 0
  for (const value of journal.totalsByPrefix('finance.spend', range).values()) spending += value
  let activityMinutes = 0
  for (const [key, value] of journal.totalsByPrefix('activity', range)) {
    if (key.endsWith('.minutes')) activityMinutes += value
  }
  return { spending, activityMinutes, calories: journal.totalOf(MetricKey.of('nutrition.calories'), range) }
}

function previousRangeOf(range: DayRange): DayRange {
  const prevEnd = range.start.addDays(-1)
  return DayRange.of(prevEnd.addDays(-(range.lengthInDays() - 1)), prevEnd)
}

/**
 * The read-side review: per-goal progress (judged at the range end) and
 * streaks, top spending, activity totals, planner completion rate,
 * period-over-period deltas, and the per-area life-wheel rollup. Takes the
 * catalogs it needs explicitly; `projects` rides along for the
 * projects-touched rollup (it carries the area mapping nothing else has).
 */
export function review(input: {
  journal: Journal
  planner: Planner
  goals: readonly Goal[]
  activities: readonly Activity[]
  areas: readonly LifeArea[]
  projects?: readonly Project[]
  period: DayRange
}): Review {
  const { journal, planner, goals, activities, areas, projects = [], period } = input

  const goalReviews: GoalReview[] = goals.map((goal) => ({
    goalId: goal.id,
    ...(goal.name !== undefined ? { name: goal.name } : {}),
    progress: goal.progressOn(journal, period.end),
    streak: streak(journal, goal, period.end),
  }))

  const topSpending = [...journal.totalsByPrefix('finance.spend', period)]
    .map(([key, total]) => ({ category: key.split('.')[2] as string, total }))
    .sort((a, b) => b.total - a.total)

  const perSlug = new Map<string, { count: number; minutes: number }>()
  for (const [key, value] of journal.totalsByPrefix('activity', period)) {
    const [, slug, unit] = key.split('.') as [string, string, string]
    const entry = perSlug.get(slug) ?? { count: 0, minutes: 0 }
    if (unit === 'count') entry.count += value
    if (unit === 'minutes') entry.minutes += value
    perSlug.set(slug, entry)
  }
  const activityTotals = [...perSlug].map(([slug, totals]) => ({ slug, ...totals }))

  const completionRate = planner.completionRate(period)

  const totals = totalsFor(journal, period)
  const previousTotals = totalsFor(journal, previousRangeOf(period))
  const deltas: ReviewTotals = {
    spending: totals.spending - previousTotals.spending,
    activityMinutes: totals.activityMinutes - previousTotals.activityMinutes,
    calories: totals.calories - previousTotals.calories,
  }

  // ── Life wheel ────────────────────────────────────────────────────────────
  const slugToArea = new Map<string, Id | undefined>(activities.map((a) => [a.slug, a.areaId]))
  const minutesByArea = new Map<Id | undefined, number>()
  for (const [key, value] of journal.totalsByPrefix('activity', period)) {
    if (!key.endsWith('.minutes')) continue
    const slug = key.split('.')[1] as string
    const areaId = slugToArea.get(slug) // unknown slugs land in unassigned
    minutesByArea.set(areaId, (minutesByArea.get(areaId) ?? 0) + value)
  }
  const touchedProjects = projects.filter((project) =>
    planner
      .all()
      .some(
        (p) =>
          p instanceof Task &&
          p.projectId === project.id &&
          ((p.due !== undefined && period.contains(p.due)) ||
            (p.completedOn !== undefined && period.contains(p.completedOn))),
      ),
  )

  const rollupFor = (areaId: Id | undefined, name: string): AreaRollup => {
    const areaGoals = goalReviews.filter((_review, i) => goals[i]?.areaId === areaId)
    return {
      ...(areaId !== undefined ? { areaId } : {}),
      name,
      goalsMet: areaGoals.filter((g) => g.progress.met === true).length,
      goalsTotal: areaGoals.length,
      activityMinutes: minutesByArea.get(areaId) ?? 0,
      projectsTouched: touchedProjects.filter((p) => p.areaId === areaId).length,
    }
  }

  const areaRollups: AreaRollup[] = [
    ...areas.map((area) => rollupFor(area.id, area.name)),
    rollupFor(undefined, 'unassigned'),
  ]

  return {
    period,
    goals: goalReviews,
    topSpending,
    activityTotals,
    ...(completionRate !== undefined ? { completionRate } : {}),
    totals,
    previousTotals,
    deltas,
    areas: areaRollups,
  }
}
