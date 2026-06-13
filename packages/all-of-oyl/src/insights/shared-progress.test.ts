import { describe, expect, it } from 'vitest'
import { sharedProgress } from './shared-progress.js'
import { Connection } from '../share/connection.js'
import { Grant } from '../share/grant.js'
import { Goal } from '../goal/goal.js'
import { LifeArea } from '../core/life-area.js'
import { Activity } from '../activity/activity.js'
import { ActivitySession } from '../activity/activity-session.js'
import { Measurement } from '../track/measurement.js'
import { Task } from '../plan/task.js'
import { DayPlan } from '../plan/day-plan.js'
import { Planner } from '../plan/planner.js'
import { DayKey } from '../core/day-key.js'
import { Journal } from '../core/journal.js'
import { Quantity } from '../core/quantity.js'
import { Id } from '../core/id.js'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const at = (s: string, hourUtc: number) => new Date(`${s}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

const avery = Id.of('00000000-0000-4000-8000-000000000001') // grantor
const blake = Id.of('00000000-0000-4000-8000-000000000002') // viewer
const mallory = Id.of('00000000-0000-4000-8000-000000000099')

function world() {
  const health = new LifeArea({ name: 'Health', slug: 'health' })
  const run = new Activity({ name: 'Run', slug: 'run', areaId: health.id })
  const journal = new Journal(NY)
  journal.add(new ActivitySession({ occurredAt: at('2026-06-09', 11), activity: run, quantities: [Quantity.of(30, 'minutes')] }))
  journal.add(new ActivitySession({ occurredAt: at('2026-06-10', 11), activity: run, quantities: [Quantity.of(30, 'minutes')] }))
  journal.add(new Measurement({ occurredAt: at('2026-06-10', 8), metric: 'body.weight_kg', value: 80 })) // private — never projected

  const planner = new Planner()
  const taxes = new Task({ title: 'File taxes', due: day('2026-06-10') })
  planner.add(taxes)
  planner.setDayPlan(new DayPlan({ day: day('2026-06-10'), slots: [{ planId: taxes.id, start: '09:00', end: '10:00' }] }))

  const runGoal = new Goal({ name: 'Run weekly', metric: 'activity.run.minutes', target: 50, direction: 'atLeast', period: 'week', areaId: health.id })
  const secretGoal = new Goal({ name: 'Secret', metric: 'body.weight_kg', target: 80, direction: 'atMost', period: 'day', aggregation: 'last' })

  const connection = new Connection({ requesterId: blake, addresseeId: avery })
  connection.accept(avery)

  return { journal, planner, goals: [runGoal, secretGoal], activities: [run], areas: [health], connection, runGoal }
}

const baseInput = (w: ReturnType<typeof world>, grants: Grant[], viewerId = blake) => ({
  journal: w.journal,
  planner: w.planner,
  goals: w.goals,
  connections: [w.connection],
  grants,
  grantorId: avery, // the owner of the roots above
  viewerId,
  asOf: day('2026-06-10'),
  activities: w.activities,
  areas: w.areas,
})

describe('sharedProgress', () => {
  it('projects exactly what a live grant exposes — and nothing else', () => {
    const w = world()
    const grant = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: { kind: 'goal-progress', goalId: w.runGoal.id } })
    const view = sharedProgress(baseInput(w, [grant]))
    expect(view.goals).toHaveLength(1)
    expect(view.goals[0]?.name).toBe('Run weekly')
    expect(view.goals[0]?.progress.met).toBe(true) // 60 ≥ 50 this week
    expect(view.goals[0]?.streak).toBeGreaterThanOrEqual(1)
    // the secret goal, the weight data, the day plan: not in the view
    expect(view.goals.find((g) => g.name === 'Secret')).toBeUndefined()
    expect(view.areas).toHaveLength(0)
    expect(view.metrics).toHaveLength(0)
    expect(view.dayPlan).toBeUndefined()
  })

  it('default-deny: every broken precondition yields nothing', () => {
    const w = world()
    const goalScope = { kind: 'goal-progress', goalId: w.runGoal.id } as const

    // no connection for the grant
    const orphan = new Grant({ connectionId: Id.create(), grantorId: avery, scope: goalScope })
    expect(sharedProgress(baseInput(w, [orphan])).goals).toHaveLength(0)

    // connection not accepted
    const invited = new Connection({ requesterId: blake, addresseeId: avery })
    const pendingGrant = new Grant({ connectionId: invited.id, grantorId: avery, scope: goalScope })
    expect(
      sharedProgress({ ...baseInput(w, [pendingGrant]), connections: [invited] }).goals,
    ).toHaveLength(0)

    // viewer is not the other member
    const grant = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: goalScope })
    expect(sharedProgress(baseInput(w, [grant], mallory)).goals).toHaveLength(0)

    // grantor is not a member of the connection
    const foreign = new Grant({ connectionId: w.connection.id, grantorId: mallory, scope: goalScope })
    expect(sharedProgress(baseInput(w, [foreign])).goals).toHaveLength(0)

    // a grant from the OTHER member never projects THIS grantor's roots (misattribution guard)
    const blakesGrant = new Grant({ connectionId: w.connection.id, grantorId: blake, scope: goalScope })
    expect(sharedProgress(baseInput(w, [blakesGrant], avery)).goals).toHaveLength(0)

    // revoked
    const revoked = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: goalScope })
    revoked.revoke(day('2026-06-09'))
    expect(sharedProgress(baseInput(w, [revoked])).goals).toHaveLength(0)

    // expired yesterday (inclusive boundary: expiring TODAY is still live)
    const expired = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: goalScope, expiresOn: day('2026-06-09') })
    expect(sharedProgress(baseInput(w, [expired])).goals).toHaveLength(0)
    const expiringToday = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: goalScope, expiresOn: day('2026-06-10') })
    expect(sharedProgress(baseInput(w, [expiringToday])).goals).toHaveLength(1)

    // blocked connection
    w.connection.block(avery)
    expect(sharedProgress(baseInput(w, [grant])).goals).toHaveLength(0)
  })

  it('projects area summaries, metric aggregates, and the day plan under their scopes', () => {
    const w = world()
    const grants = [
      new Grant({ connectionId: w.connection.id, grantorId: avery, scope: { kind: 'area-summary', areaId: w.areas[0]!.id } }),
      new Grant({ connectionId: w.connection.id, grantorId: avery, scope: { kind: 'metric', prefix: 'activity.run' } }),
      new Grant({ connectionId: w.connection.id, grantorId: avery, scope: { kind: 'day-plan' } }),
    ]
    const view = sharedProgress(baseInput(w, grants))

    expect(view.areas).toHaveLength(1)
    expect(view.areas[0]?.name).toBe('Health')
    expect(view.areas[0]?.activityMinutes).toBe(60)

    expect(view.metrics).toHaveLength(1)
    expect(view.metrics[0]?.prefix).toBe('activity.run')
    const minuteRow = view.metrics[0]?.totals.find((t) => t.metric === 'activity.run.minutes')
    expect(minuteRow?.total).toBe(60)
    // a metric grant for one prefix never leaks another namespace
    expect(view.metrics[0]?.totals.every((t) => t.metric.startsWith('activity.run'))).toBe(true)

    expect(view.dayPlan?.day.value).toBe('2026-06-10')
    expect(view.dayPlan?.slots).toEqual([{ title: 'File taxes', kind: 'task', start: '09:00', end: '10:00' }])
  })
})
