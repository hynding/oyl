import { describe, expect, it } from 'vitest'
import { Planner } from './planner.js'
import { Task } from './task.js'
import { Appointment } from './appointment.js'
import { PlannedMeal } from './planned-meal.js'
import { Project } from './project.js'
import { DayPlan } from './day-plan.js'
import { Cadence } from '../core/cadence.js'
import { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

const day = (s: string) => DayKey.of(s)
const range = (a: string, b: string) => DayRange.of(day(a), day(b))
const NY = 'America/New_York'
const foodId = Id.of('00000000-0000-4000-8000-000000000031')

describe('Planner', () => {
  it('strict adds, idempotent removes, lookup', () => {
    const planner = new Planner()
    const task = new Task({ title: 'File taxes', due: day('2026-06-05') })
    planner.add(task)
    expect(planner.get(task.id)).toBe(task)
    let caught: unknown
    try {
      planner.add(task)
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('DUPLICATE_ID')
    planner.remove(task.id)
    planner.remove(task.id) // no-op
    expect(planner.get(task.id)).toBeUndefined()
    expect(planner.all()).toHaveLength(0)
  })

  it('dueOn / overdue / upcoming consider only open plans', () => {
    const planner = new Planner()
    const today = new Task({ title: 'Today', due: day('2026-06-05') })
    const late = new Task({ title: 'Late', due: day('2026-06-01') })
    const soon = new Task({ title: 'Soon', due: day('2026-06-08') })
    const doneLate = new Task({ title: 'Done late', due: day('2026-06-01') })
    doneLate.complete(day('2026-06-02'))
    const canceled = new Task({ title: 'Canceled', due: day('2026-06-05') })
    canceled.cancel()
    const undated = new Task({ title: 'Someday' })
    for (const p of [today, late, soon, doneLate, canceled, undated]) planner.add(p)

    expect(planner.dueOn(day('2026-06-05')).map((p) => p.title)).toEqual(['Today'])
    expect(planner.overdue(day('2026-06-05')).map((p) => p.title)).toEqual(['Late'])
    expect(planner.upcoming(range('2026-06-05', '2026-06-10')).map((p) => p.title)).toEqual(['Today', 'Soon'])
  })

  it('complete() fulfills and respawns recurring tasks via the planner', () => {
    const planner = new Planner()
    const chore = new Task({ title: 'Water the plants', due: day('2026-06-05'), cadence: Cadence.of(7, 'days') })
    planner.add(chore)
    const entryId = Id.create()
    const spawned = planner.complete(chore.id, day('2026-06-08'), entryId)
    expect(chore.status).toBe('done')
    expect(chore.fulfilledBy).toEqual([entryId])
    expect(spawned).toBeDefined()
    expect(spawned?.due?.value).toBe('2026-06-15') // re-anchored on actual completion
    expect(planner.get(spawned!.id)).toBe(spawned)
    // a late respawn can be born overdue — honest, not a bug
    expect(planner.overdue(day('2026-06-20')).map((p) => p.id)).toContain(spawned!.id)

    const oneOff = new Task({ title: 'File taxes', due: day('2026-06-05') })
    planner.add(oneOff)
    expect(planner.complete(oneOff.id, day('2026-06-05'))).toBeUndefined()

    let caught: unknown
    try {
      planner.complete(Id.create(), day('2026-06-05'))
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
  })

  it('completionRate counts done/(done+open) among plans due in range; undefined when none', () => {
    const planner = new Planner()
    expect(planner.completionRate(range('2026-06-01', '2026-06-07'))).toBeUndefined()
    const a = new Task({ title: 'a', due: day('2026-06-02') })
    const b = new Task({ title: 'b', due: day('2026-06-03') })
    const c = new Task({ title: 'c', due: day('2026-06-04') })
    const x = new Task({ title: 'x', due: day('2026-06-04') })
    x.cancel()
    for (const p of [a, b, c, x]) planner.add(p)
    planner.complete(a.id, day('2026-06-02'))
    expect(planner.completionRate(range('2026-06-01', '2026-06-07'))).toBeCloseTo(1 / 3)
  })

  it('project progress reads its tasks through the planner', () => {
    const planner = new Planner()
    const project = new Project({ name: 'Spring reset' })
    const done = new Task({ title: 'd', due: day('2026-06-02'), projectId: project.id })
    const open = new Task({ title: 'o', due: day('2026-06-03'), projectId: project.id })
    const unrelated = new Task({ title: 'u', due: day('2026-06-03') })
    for (const p of [done, open, unrelated]) planner.add(p)
    planner.complete(done.id, day('2026-06-02'))
    expect(project.progress(planner)).toBeCloseTo(0.5)
    expect(new Project({ name: 'Empty' }).progress(planner)).toBeUndefined()
  })

  it('agendaFor orders appointments by startsAt, then tasks, then meals; canceled excluded', () => {
    const planner = new Planner()
    const lateAppt = new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-05T19:00:00Z'), tz: NY })
    const earlyAppt = new Appointment({ title: 'Standup', startsAt: new Date('2026-06-05T13:00:00Z'), tz: NY })
    const task = new Task({ title: 'File taxes', due: day('2026-06-05') })
    const meal = new PlannedMeal({ title: 'Oatmeal', day: day('2026-06-05'), food: { id: foodId } })
    const canceled = new Task({ title: 'Nope', due: day('2026-06-05') })
    canceled.cancel()
    for (const p of [lateAppt, task, meal, earlyAppt, canceled]) planner.add(p)
    expect(planner.agendaFor(day('2026-06-05')).map((p) => p.title)).toEqual(['Standup', 'Dentist', 'File taxes', 'Oatmeal'])
  })

  it('dayPlanFor returns the stored plan or a derived default; scheduleFor skips stale slots', () => {
    const planner = new Planner()
    const task = new Task({ title: 'File taxes', due: day('2026-06-05') })
    const ghost = new Task({ title: 'Ghost', due: day('2026-06-05') })
    planner.add(task)
    planner.add(ghost)

    // derived default: ordered slots, no time boxes, not stored
    const derived = planner.dayPlanFor(day('2026-06-05'))
    expect(derived.slots.map((s) => s.planId)).toEqual([task.id, ghost.id])

    const stored = new DayPlan({
      day: day('2026-06-05'),
      slots: [
        { planId: ghost.id, start: '09:00', end: '10:00' },
        { planId: task.id, start: '10:00', end: '11:00' },
      ],
    })
    planner.setDayPlan(stored)
    expect(planner.dayPlanFor(day('2026-06-05'))).toBe(stored)

    // replacing for the same day
    const replacement = new DayPlan({ day: day('2026-06-05'), slots: [{ planId: task.id }] })
    planner.setDayPlan(replacement)
    expect(planner.dayPlanFor(day('2026-06-05'))).toBe(replacement)

    // stale slots are skipped by the reading query but kept in storage
    planner.setDayPlan(stored)
    planner.remove(ghost.id)
    const schedule = planner.scheduleFor(day('2026-06-05'))
    expect(schedule.map((s) => s.plan.id)).toEqual([task.id])
    expect(schedule[0]?.start).toBe('10:00')
    expect(planner.dayPlanFor(day('2026-06-05')).slots).toHaveLength(2) // storage untouched
  })

  it('groceryList aggregates servings per food across open planned meals in range', () => {
    const planner = new Planner()
    const otherFood = Id.of('00000000-0000-4000-8000-000000000034')
    planner.add(new PlannedMeal({ title: 'Oatmeal Mon', day: day('2026-06-01'), food: { id: foodId }, servings: 1.5 }))
    planner.add(new PlannedMeal({ title: 'Oatmeal Tue', day: day('2026-06-02'), food: { id: foodId } }))
    planner.add(new PlannedMeal({ title: 'Bowl Tue', day: day('2026-06-02'), food: { id: otherFood }, servings: 2 }))
    planner.add(new PlannedMeal({ title: 'Next week', day: day('2026-06-09'), food: { id: foodId } }))
    const eaten = new PlannedMeal({ title: 'Eaten', day: day('2026-06-01'), food: { id: foodId } })
    planner.add(eaten)
    planner.complete(eaten.id, day('2026-06-01'))

    const list = planner.groceryList(range('2026-06-01', '2026-06-07'))
    expect(list.get(foodId)?.amount).toBe(2.5)
    expect(list.get(foodId)?.unit).toBe('servings')
    expect(list.get(otherFood)?.amount).toBe(2)
  })
})
