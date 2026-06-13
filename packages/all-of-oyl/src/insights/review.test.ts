// packages/all-of-oyl/src/insights/review.test.ts
import { describe, expect, it } from 'vitest'
import { review } from './review.js'
import { Goal } from '../goal/goal.js'
import { LifeArea } from '../core/life-area.js'
import { Activity } from '../activity/activity.js'
import { ActivitySession } from '../activity/activity-session.js'
import { Measurement } from '../track/measurement.js'
import { Transaction } from '../finance/transaction.js'
import { Task } from '../plan/task.js'
import { Project } from '../plan/project.js'
import { Planner } from '../plan/planner.js'
import { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import { Journal } from '../core/journal.js'
import { Money } from '../core/money.js'
import { Quantity } from '../core/quantity.js'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const at = (s: string, hourUtc: number) => new Date(`${s}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

describe('review', () => {
  const health = new LifeArea({ name: 'Health', slug: 'health' })
  const career = new LifeArea({ name: 'Career', slug: 'career' })
  const run = new Activity({ name: 'Run', slug: 'run', areaId: health.id })

  function build() {
    const journal = new Journal(NY)
    // current range 06-08..06-14: two runs, daily pages, one screen blowout, spending, calories
    journal.add(new ActivitySession({ occurredAt: at('2026-06-08', 11), activity: run, quantities: [Quantity.of(30, 'minutes')] }))
    journal.add(new ActivitySession({ occurredAt: at('2026-06-10', 11), activity: run, quantities: [Quantity.of(30, 'minutes')] }))
    for (const d of ['2026-06-08', '2026-06-09', '2026-06-14']) {
      // 06-14 included so the daily goal has data on the range END day (progress is judged there)
      journal.add(new Measurement({ occurredAt: at(d, 12), metric: 'custom.pages_read', value: 25 }))
    }
    journal.add(new Measurement({ occurredAt: at('2026-06-09', 22), metric: 'custom.screen_minutes', value: 200 }))
    journal.add(new Transaction({ occurredAt: at('2026-06-09', 18), amount: Money.usd(5000), category: 'groceries', direction: 'expense' }))
    journal.add(new Transaction({ occurredAt: at('2026-06-10', 19), amount: Money.usd(2000), category: 'dining', direction: 'expense' }))
    journal.add(new Measurement({ occurredAt: at('2026-06-08', 13), metric: 'custom.kcal_proxy', value: 1 })) // unrelated noise
    // previous range 06-01..06-07: lighter spending for the delta
    journal.add(new Transaction({ occurredAt: at('2026-06-03', 18), amount: Money.usd(3000), category: 'groceries', direction: 'expense' }))

    const planner = new Planner()
    const project = new Project({ name: 'Promotion push', areaId: career.id })
    const done = new Task({ title: 'Draft self-review', due: day('2026-06-09'), projectId: project.id })
    const open = new Task({ title: 'Schedule 1:1', due: day('2026-06-12') })
    planner.add(done)
    planner.add(open)
    planner.complete(done.id, day('2026-06-09'))

    const pagesGoal = new Goal({ name: 'Read', metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day', areaId: health.id })
    const screenGoal = new Goal({ name: 'Less scrolling', metric: 'custom.screen_minutes', target: 120, direction: 'atMost', period: 'week' })

    return {
      journal, planner, project,
      input: {
        journal, planner,
        goals: [pagesGoal, screenGoal],
        activities: [run],
        areas: [health, career],
        projects: [project],
        period: DayRange.of(day('2026-06-08'), day('2026-06-14')),
      },
    }
  }

  it('reports per-goal progress and streaks', () => {
    const { input } = build()
    const result = review(input)
    expect(result.goals).toHaveLength(2)
    const pages = result.goals.find((g) => g.name === 'Read')!
    expect(pages.progress.met).toBe(true) // judged at the range end's period
    expect(pages.streak).toBeGreaterThanOrEqual(3)
    const screen = result.goals.find((g) => g.name === 'Less scrolling')!
    expect(screen.progress.met).toBe(false) // 200 screen minutes > 120 for the week at range end — progressOn has no wall clock, so the window is judged outright
  })

  it('ranks top spending and totals activity', () => {
    const { input } = build()
    const result = review(input)
    expect(result.topSpending).toEqual([
      { category: 'groceries', total: 50 },
      { category: 'dining', total: 20 },
    ])
    expect(result.activityTotals).toEqual([{ slug: 'run', count: 2, minutes: 60 }])
  })

  it('computes completion rate and period-over-period deltas', () => {
    const { input } = build()
    const result = review(input)
    expect(result.completionRate).toBeCloseTo(0.5)
    expect(result.totals.spending).toBeCloseTo(70)
    expect(result.previousTotals.spending).toBeCloseTo(30)
    expect(result.deltas.spending).toBeCloseTo(40)
    expect(result.totals.activityMinutes).toBe(60)
    expect(result.previousTotals.activityMinutes).toBe(0)
  })

  it('rolls up the life wheel per area with an unassigned bucket', () => {
    const { input } = build()
    const result = review(input)
    expect(result.areas.map((a) => a.name)).toEqual(['Health', 'Career', 'unassigned'])
    const healthRollup = result.areas[0]!
    expect(healthRollup.goalsTotal).toBe(1)
    expect(healthRollup.goalsMet).toBe(1)
    expect(healthRollup.activityMinutes).toBe(60)
    const careerRollup = result.areas[1]!
    expect(careerRollup.projectsTouched).toBe(1)
    const unassigned = result.areas[2]!
    expect(unassigned.goalsTotal).toBe(1) // the screen goal has no area
  })
})
