import type { Activity } from '../activity/activity.js'
import type { DayKey } from '../core/day-key.js'
import type { Id } from '../core/id.js'
import type { Journal } from '../core/journal.js'
import type { LifeArea } from '../core/life-area.js'
import type { MetricKey } from '../core/metric-key.js'
import type { Goal } from '../goal/goal.js'
import { periodWindowOf } from '../goal/period.js'
import type { Planner } from '../plan/planner.js'
import type { Project } from '../plan/project.js'
import type { Connection } from '../share/connection.js'
import type { Grant } from '../share/grant.js'
import { type AreaRollup, type GoalReview, type Review, review } from './review.js'
import { streak } from './streak.js'

export type SharedMetricSummary = { prefix: string; totals: readonly { metric: MetricKey; total: number }[] }
export type SharedDayPlan = { day: DayKey; slots: readonly { title: string; kind: string; start?: string; end?: string }[] }

/** Everything a viewer is entitled to see — derived data only, never raw entries. */
export type SharedView = {
  viewerId: Id
  asOf: DayKey
  goals: readonly GoalReview[]
  areas: readonly AreaRollup[]
  metrics: readonly SharedMetricSummary[]
  dayPlan?: SharedDayPlan
}

/**
 * THE one place cross-user visibility is decided (spec growth invariant —
 * never add a second). Default-deny: a grant projects only after its
 * connection exists, is accepted, the grantor is a member, the viewer is
 * the OTHER member, and the grant is live as of asOf; absence at any step
 * denies. Composes the read primitives (progressOn + streak, review's
 * rollup, totalsByPrefix, scheduleFor) — no re-derived read logic.
 *
 * Trusted boundary: this function must run server-side (or equivalent) —
 * a client is never handed another user's Journal to filter; it receives
 * only this projection's output.
 */
export function sharedProgress(input: {
  /** The GRANTOR's roots and catalogs — grantorId declares whose they are. */
  journal: Journal
  planner: Planner
  goals: readonly Goal[]
  connections: readonly Connection[]
  grants: readonly Grant[]
  /** The owner of the roots above. Grants from anyone else are skipped — the misattribution guard. */
  grantorId: Id
  viewerId: Id
  asOf: DayKey
  activities?: readonly Activity[]
  areas?: readonly LifeArea[]
  projects?: readonly Project[]
}): SharedView {
  const { journal, planner, goals, connections, grants, grantorId, viewerId, asOf, activities = [], areas = [], projects = [] } = input
  const connectionById = new Map(connections.map((c) => [c.id, c]))
  const week = periodWindowOf('week', asOf)

  const sharedGoals: GoalReview[] = []
  const sharedAreas: AreaRollup[] = []
  const sharedMetrics: SharedMetricSummary[] = []
  let sharedDayPlan: SharedDayPlan | undefined
  let weeklyReview: Review | undefined // computed at most once, only when an area grant projects

  for (const grant of grants) {
    if (grant.grantorId !== grantorId) continue // not this grantor's data — misattribution guard
    const connection = connectionById.get(grant.connectionId)
    if (connection === undefined) continue // absence denies
    if (connection.status !== 'accepted') continue
    if (!connection.isMember(grant.grantorId)) continue
    if (connection.otherMember(grant.grantorId) !== viewerId) continue
    if (!grant.isLiveOn(asOf)) continue

    const scope = grant.scope
    switch (scope.kind) {
      case 'goal-progress': {
        const goal = goals.find((g) => g.id === scope.goalId)
        if (goal === undefined) break // absence denies
        sharedGoals.push({
          goalId: goal.id,
          ...(goal.name !== undefined ? { name: goal.name } : {}),
          progress: goal.progressOn(journal, asOf),
          streak: streak(journal, goal, asOf),
        })
        break
      }
      case 'area-summary': {
        weeklyReview ??= review({ journal, planner, goals, activities, areas, projects, period: week })
        const rollup = weeklyReview.areas.find((a) => a.areaId === scope.areaId)
        if (rollup !== undefined) sharedAreas.push(rollup)
        break
      }
      case 'metric': {
        const totals = [...journal.totalsByPrefix(scope.prefix, week)].map(([metric, total]) => ({ metric, total }))
        sharedMetrics.push({ prefix: scope.prefix, totals })
        break
      }
      case 'day-plan': {
        sharedDayPlan = {
          day: asOf,
          slots: planner.scheduleFor(asOf).map((slot) => ({
            title: slot.plan.title,
            kind: slot.plan.kind,
            ...(slot.start !== undefined ? { start: slot.start } : {}),
            ...(slot.end !== undefined ? { end: slot.end } : {}),
          })),
        }
        break
      }
    }
  }

  return {
    viewerId,
    asOf,
    goals: sharedGoals,
    areas: sharedAreas,
    metrics: sharedMetrics,
    ...(sharedDayPlan !== undefined ? { dayPlan: sharedDayPlan } : {}),
  }
}
