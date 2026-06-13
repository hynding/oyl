import type { DayKey } from '../core/day-key.js'
import type { DayRange } from '../core/day-range.js'
import { DomainError } from '../core/domain-error.js'
import type { Id } from '../core/id.js'
import type { Plan } from '../core/plan.js'
import { Quantity } from '../core/quantity.js'
import { Appointment } from './appointment.js'
import { DayPlan, type DayPlanSlot } from './day-plan.js'
import { PlannedMeal } from './planned-meal.js'
import { Task } from './task.js'

export type ScheduledSlot = { plan: Plan; start?: string; end?: string }

/**
 * One person's record of what's supposed to happen. A plain in-memory
 * aggregate (apps hydrate it from repositories), mirroring Journal: strict
 * adds, idempotent removes. Completion routes through the planner so
 * recurring tasks respawn into it.
 */
export class Planner {
  /** Insertion order is the documented secondary order for queries. */
  private readonly plans: Plan[] = []
  private readonly byId = new Map<Id, Plan>()
  private readonly dayPlans = new Map<string, DayPlan>()

  add(plan: Plan): void {
    if (this.byId.has(plan.id)) {
      throw new DomainError('DUPLICATE_ID', `plan already in planner: ${plan.id}`)
    }
    this.byId.set(plan.id, plan)
    this.plans.push(plan)
  }

  /** Idempotent — removing a missing id is a no-op. */
  remove(id: Id): void {
    if (!this.byId.delete(id)) return
    const index = this.plans.findIndex((p) => p.id === id)
    this.plans.splice(index, 1)
  }

  get(id: Id): Plan | undefined {
    return this.byId.get(id)
  }

  all(): readonly Plan[] {
    return [...this.plans]
  }

  /** Open plans due exactly on `day`. */
  dueOn(day: DayKey): readonly Plan[] {
    return this.plans.filter((p) => p.status === 'open' && p.due !== undefined && p.due.equals(day))
  }

  /** Open plans whose due day has passed. */
  overdue(day: DayKey): readonly Plan[] {
    return this.plans.filter((p) => p.status === 'open' && p.due !== undefined && p.due.compare(day) < 0)
  }

  /** Open plans due in the range, ordered by due day then insertion. */
  upcoming(range: DayRange): readonly Plan[] {
    return this.plans
      .filter((p) => p.status === 'open' && p.due !== undefined && range.contains(p.due))
      .sort((a, b) => (a.due as DayKey).compare(b.due as DayKey))
  }

  /**
   * Complete a plan through the planner. If it was a recurring task, the
   * successor (due cadence.nextAfter(completedOn) — re-anchored on actual
   * completion) is added and returned; it can be born overdue, which is
   * honest. Returns undefined otherwise.
   */
  complete(planId: Id, on: DayKey, entryId?: Id): Task | undefined {
    const plan = this.byId.get(planId)
    if (plan === undefined) {
      throw new DomainError('ILLEGAL_TRANSITION', `cannot complete an unknown plan: ${planId}`)
    }
    plan.complete(on, entryId)
    if (plan instanceof Task && plan.cadence !== undefined) {
      const next = plan.spawnNext()
      this.add(next)
      return next
    }
    return undefined
  }

  /** done ÷ (done + open) among plans due in the range; canceled excluded; undefined when none. */
  completionRate(range: DayRange): number | undefined {
    const inRange = this.plans.filter((p) => p.due !== undefined && range.contains(p.due))
    const done = inRange.filter((p) => p.status === 'done').length
    const open = inRange.filter((p) => p.status === 'open').length
    const total = done + open
    return total === 0 ? undefined : done / total
  }

  /** The derived default agenda: appointments by startsAt, then tasks, then planned meals. Canceled plans excluded. */
  agendaFor(day: DayKey): readonly Plan[] {
    const today = this.plans.filter((p) => p.status !== 'canceled' && p.due !== undefined && p.due.equals(day))
    const appointments = today
      .filter((p): p is Appointment => p instanceof Appointment)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    const tasks = today.filter((p) => p instanceof Task)
    const meals = today.filter((p) => p instanceof PlannedMeal)
    const rest = today.filter((p) => !(p instanceof Appointment) && !(p instanceof Task) && !(p instanceof PlannedMeal))
    return [...appointments, ...tasks, ...meals, ...rest]
  }

  /** At most one DayPlan per day; setting replaces (it's the user's edited version). */
  setDayPlan(dayPlan: DayPlan): void {
    this.dayPlans.set(dayPlan.day.value, dayPlan)
  }

  /** The stored DayPlan for the day, or a derived default (agenda order, no time boxes; not stored). */
  dayPlanFor(day: DayKey): DayPlan {
    const stored = this.dayPlans.get(day.value)
    if (stored !== undefined) return stored
    const slots: DayPlanSlot[] = this.agendaFor(day).map((p) => ({ planId: p.id }))
    return new DayPlan({ day, slots })
  }

  /** The consumable day view: slots resolved against live plans; canceled/missing skipped (storage untouched). */
  scheduleFor(day: DayKey): readonly ScheduledSlot[] {
    const resolved: ScheduledSlot[] = []
    for (const slot of this.dayPlanFor(day).slots) {
      const plan = this.byId.get(slot.planId)
      if (plan === undefined || plan.status === 'canceled') continue
      resolved.push({
        plan,
        ...(slot.start !== undefined ? { start: slot.start } : {}),
        ...(slot.end !== undefined ? { end: slot.end } : {}),
      })
    }
    return resolved
  }

  /** Servings per food id across OPEN planned meals due in the range. */
  groceryList(range: DayRange): ReadonlyMap<Id, Quantity> {
    const list = new Map<Id, Quantity>()
    for (const plan of this.plans) {
      if (!(plan instanceof PlannedMeal) || plan.status !== 'open' || !range.contains(plan.day)) continue
      const existing = list.get(plan.foodId)
      const addition = Quantity.of(plan.servings, 'servings')
      list.set(plan.foodId, existing === undefined ? addition : existing.add(addition))
    }
    return list
  }
}
